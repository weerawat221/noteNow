import test from "node:test";
import assert from "node:assert/strict";

// Environment Setup
process.env.KEY_ENCRYPTION_KEYS = "v1:B8rly6+unPCy3yv/pBzwyuljIk3Sk9xGS7+OOtcG6yQ=";

import { summaryLock, SummaryLockStore } from "../src/lib/summary-lock.js";
import { SUMMARY_ERRORS, parseSummaryError } from "../src/lib/summary-errors.js";
import { SUMMARY_CONFIG } from "../src/config/summary.js";
import { validateDriveFile } from "../src/lib/summary-drive.js";
import {
  verifyTokenCount,
  deleteGeminiFile,
  streamGeminiWithFallback,
  executeGenerateContentStream,
} from "../src/lib/gemini-summary.js";

test("🔒 SUMMARY LOCK: ป้องกันงานซ้ำและจำกัด Concurrency", async (t) => {
  const store = new SummaryLockStore();
  const userId = 77;
  const docId = 88;

  await t.test("จอง Lock สำเร็จในครั้งแรก", () => {
    const res = store.acquire(userId, docId);
    assert.equal(res.success, true);
    assert.equal(store.getActiveCount(), 1);
  });

  await t.test("ปฏิเสธงานซ้ำสำหรับ (user, document) เดียวกันด้วยรหัส BUSY", () => {
    const res = store.acquire(userId, docId);
    assert.equal(res.success, false);
    assert.equal(res.reason, "BUSY");
    assert.ok(res.retryAfter > 0);
  });

  await t.test("ปลด Lock แล้วสามารถจองใหม่ได้", () => {
    store.release(userId, docId);
    assert.equal(store.getActiveCount(), 0);

    const res = store.acquire(userId, docId);
    assert.equal(res.success, true);
    store.release(userId, docId);
  });

  await t.test("ปฏิเสธเมื่อ Global Concurrency ถึงเพดานสูงสุด", () => {
    const freshStore = new SummaryLockStore();
    for (let i = 0; i < SUMMARY_CONFIG.GLOBAL_CONCURRENCY_CAP; i++) {
      const res = freshStore.acquire(i + 1, 100);
      assert.equal(res.success, true);
    }

    // งานที่เกินขีดจำกัด
    const overflow = freshStore.acquire(999, 100);
    assert.equal(overflow.success, false);
    assert.equal(overflow.reason, "GLOBAL_CAP");
  });
});

test("⚠️ ERROR CODES: การแปลงและข้อความภาษาไทย", async (t) => {
  await t.test("ตรวจสอบความครบถ้วนของรหัสข้อผิดพลาด 11 รหัสหลัก", () => {
    const requiredCodes = [
      "GEMINI_KEY_MISSING",
      "GEMINI_KEY_INVALID",
      "GEMINI_QUOTA",
      "DRIVE_AUTH",
      "DRIVE_NOT_FOUND",
      "NOT_A_PDF",
      "FILE_TOO_LARGE",
      "DOCUMENT_TOO_LONG",
      "PDF_UNREADABLE",
      "SUMMARY_BLOCKED",
      "BUSY",
      "RATE_LIMITED",
      "UPSTREAM_UNAVAILABLE",
    ];

    for (const code of requiredCodes) {
      assert.ok(SUMMARY_ERRORS[code], `ต้องมีนิยามรหัสข้อผิดพลาด ${code}`);
      assert.ok(SUMMARY_ERRORS[code].message, `ต้องมีข้อความภาษาไทยสำหรับ ${code}`);
      assert.ok(!SUMMARY_ERRORS[code].message.includes("AIza"), "ห้ามมี Key หลุดในข้อความ");
    }
  });

  await t.test("แปลง Auth Error ของ Gemini เป็น GEMINI_KEY_INVALID", () => {
    const err = new Error("API_KEY_INVALID from google");
    const parsed = parseSummaryError(err);
    assert.equal(parsed.code, "GEMINI_KEY_INVALID");
  });

  await t.test("แปลง Quota Exceeded ของ Gemini เป็น GEMINI_QUOTA", () => {
    const err = new Error("RESOURCE_EXHAUSTED: quota exceeded");
    const parsed = parseSummaryError(err);
    assert.equal(parsed.code, "GEMINI_QUOTA");
  });

  await t.test("แปลง Network/Timeout เป็น UPSTREAM_UNAVAILABLE (ห้ามบอกว่า key ผิด)", () => {
    const err = new Error("fetch failed (ETIMEDOUT)");
    const parsed = parseSummaryError(err);
    assert.equal(parsed.code, "UPSTREAM_UNAVAILABLE");
    assert.ok(parsed.message.includes("เซิร์ฟเวอร์ภายนอก"));
  });
});

test("📄 DRIVE METADATA VALIDATION: ตรวจประเภทและขนาดไฟล์ก่อนดาวน์โหลด", async (t) => {
  const originalFetch = global.fetch;

  await t.test("ปฏิเสธไฟล์ที่ไม่ใช่ PDF ทันที (NOT_A_PDF)", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "drive-file-1",
        name: "document.docx",
        size: "102400",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    });

    try {
      await assert.rejects(
        () => validateDriveFile("mock-token", "drive-file-1"),
        (err) => err.code === "NOT_A_PDF"
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test("ปฏิเสธไฟล์ที่ขนาดเกิน 30 MB (FILE_TOO_LARGE)", async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: "drive-file-2",
        name: "big.pdf",
        size: String(35 * 1024 * 1024), // 35 MB
        mimeType: "application/pdf",
      }),
    });

    try {
      await assert.rejects(
        () => validateDriveFile("mock-token", "drive-file-2"),
        (err) => err.code === "FILE_TOO_LARGE"
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("📊 TOKEN LIMIT: ตรวจสอบความยาวโทเค็นเอกสาร", async (t) => {
  await t.test("ปฏิเสธเอกสารที่เกินเพดาน 1 ล้าน Tokens (DOCUMENT_TOO_LONG)", async () => {
    const mockAi = {
      models: {
        countTokens: async () => ({ totalTokens: 1_250_000 }),
      },
    };

    await assert.rejects(
      () => verifyTokenCount(mockAi, { inlineData: {} }),
      (err) => err.code === "DOCUMENT_TOO_LONG"
    );
  });

  await t.test("ผ่านเมื่อโทเค็นไม่เกินขีดจำกัด", async () => {
    const mockAi = {
      models: {
        countTokens: async () => ({ totalTokens: 45_000 }),
      },
    };

    const tokens = await verifyTokenCount(mockAi, { inlineData: {} });
    assert.equal(tokens, 45_000);
  });
});

test("🧹 CLEANUP IN FINALLY: ลบไฟล์ใน Files API อย่างปลอดภัย", async (t) => {
  const originalFetch = global.fetch;
  let deletedUrl = null;

  global.fetch = async (url, options) => {
    if (options?.method === "DELETE") {
      deletedUrl = url;
      return { ok: true, status: 200 };
    }
    return { ok: true };
  };

  try {
    await deleteGeminiFile("fake-key-12345", "files/test-file-999");
    assert.ok(deletedUrl && deletedUrl.includes("files/test-file-999"));
  } finally {
    global.fetch = originalFetch;
  }
});

test("🔄 AUTO-FALLBACK: สลับโมเดลอัตโนมัติเมื่อพบ 503 High Demand", async (t) => {
  await t.test("สลับไปโมเดลสำรองสำเร็จเมื่อโมเดลแรกติด 503 บนสตรีม", async () => {
    let callCount = 0;
    const attemptedModels = [];

    const mockAi = {
      models: {
        generateContentStream: async ({ model }) => {
          attemptedModels.push(model);
          callCount++;

          if (callCount === 1) {
            // จำลองกรณีโมเดลแรก throw 503 ระหว่างอ่าน chunk แรก
            return {
              async *[Symbol.asyncIterator]() {
                const err = new Error("This model is currently experiencing high demand. Spikes in demand are usually temporary.");
                err.status = 503;
                throw err;
              },
            };
          }

          // โมเดลที่สองทำงานสำเร็จ
          return {
            async *[Symbol.asyncIterator]() {
              yield { text: "สรุปเนื้อหาสำคัญ..." };
              yield { text: "สำเร็จสมบูรณ์" };
            },
          };
        },
      },
    };

    const chunks = [];
    for await (const { chunk, model } of streamGeminiWithFallback(mockAi, { inlineData: {} }, "instruction")) {
      chunks.push(chunk.text);
    }

    assert.equal(chunks.join(""), "สรุปเนื้อหาสำคัญ...สำเร็จสมบูรณ์");
    assert.ok(attemptedModels.length >= 2, "ต้องมีการพยายามเรียกอย่างน้อย 2 โมเดล");
  });

  await t.test("backward compatibility ของ executeGenerateContentStream", async () => {
    const mockAi = {
      models: {
        generateContentStream: async () => ({
          async *[Symbol.asyncIterator]() {
            yield { text: "ทดสอบสรุป" };
          },
        }),
      },
    };

    const { stream } = await executeGenerateContentStream(mockAi, { inlineData: {} }, "instruction");
    const collected = [];
    for await (const chunk of stream) {
      collected.push(chunk.text);
    }
    assert.equal(collected.join(""), "ทดสอบสรุป");
  });
});
