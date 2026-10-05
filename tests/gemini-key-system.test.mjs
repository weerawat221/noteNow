import test from "node:test";
import assert from "node:assert/strict";

// กำหนด Master Key สำหรับ Test Environment
process.env.KEY_ENCRYPTION_KEYS = "v1:B8rly6+unPCy3yv/pBzwyuljIk3Sk9xGS7+OOtcG6yQ=";

import { encryptSecret, decryptSecret } from "../src/lib/secrets.js";
import { validateGeminiKey } from "../src/lib/gemini.js";
import { InMemoryRateLimiter } from "../src/lib/rate-limiter.js";

test("🔐 SECRETS: การเข้ารหัสและถอดรหัส (AES-256-GCM + AAD)", async (t) => {
  await t.test("สามารถเข้ารหัสและถอดรหัสกลับมาเป็นข้อความเดิมได้ถูกต้อง", () => {
    const originalKey = "AIzaSyFakeGeminiApiKeyExample1234567890";
    const userId = 42;

    const payload = encryptSecret(originalKey, { userId });
    assert.ok(payload.startsWith("v1:"), "Payload ต้องมี prefix เวอร์ชัน v1:");
    assert.equal(payload.split(":").length, 4, "Payload ต้องมี 4 ส่วน (version:iv:tag:ciphertext)");

    const decrypted = decryptSecret(payload, { userId });
    assert.equal(decrypted, originalKey, "ข้อความที่ถอดรหัสต้องตรงกับข้อความเดิม");
  });

  await t.test("ห้ามถอดรหัสสำเร็จหาก userId ใน AAD ไม่ตรงกัน (Cross-user Tamper Protection)", () => {
    const originalKey = "AIzaSyFakeGeminiApiKeyExample1234567890";
    const userA = 101;
    const userB = 202;

    const payloadUserA = encryptSecret(originalKey, { userId: userA });

    // ผู้ใช้ B พยายามนำ ciphertext ของผู้ใช้ A ไปถอดรหัส
    assert.throws(
      () => {
        decryptSecret(payloadUserA, { userId: userB });
      },
      /การถอดรหัสล้มเหลว/,
      "ต้องโยน Error เมื่อ AAD ไม่ตรงกัน"
    );
  });

  await t.test("ห้ามถอดรหัสสำเร็จหากข้อมูล Ciphertext หรือ Tag ถูกดัดแปลง", () => {
    const originalKey = "AIzaSyFakeGeminiApiKeyExample1234567890";
    const userId = 55;

    const payload = encryptSecret(originalKey, { userId });
    const parts = payload.split(":");
    // ดัดแปลง ciphertext ส่วนท้าย
    parts[3] = parts[3].slice(0, -2) + "==";
    const tamperedPayload = parts.join(":");

    assert.throws(
      () => {
        decryptSecret(tamperedPayload, { userId });
      },
      /การถอดรหัสล้มเหลว/,
      "ต้องปฏิเสธ Ciphertext ที่ถูกดัดแปลง"
    );
  });
});

test("🔍 VALIDATOR: ตรวจสอบ Gemini API Key (validateGeminiKey)", async (t) => {
  await t.test("ปฏิเสธรูปแบบที่ไม่ถูกต้องทันทีก่อนส่งให้ Google (whitespace, ความยาวผิดปกติ)", async () => {
    const tooShort = await validateGeminiKey("shortKey");
    assert.equal(tooShort.status, "invalid");

    const withWhitespace = await validateGeminiKey("AIzaSyFakeKey WithSpace12345");
    assert.equal(withWhitespace.status, "invalid");

    const withNewline = await validateGeminiKey("AIzaSyFakeKey\nNewline1234567");
    assert.equal(withNewline.status, "invalid");
  });

  await t.test("ตอบสถานะ 'valid' เมื่อ Google API ตอบ 200", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      assert.ok(url.includes("generativelanguage.googleapis.com"), "ต้องเรียก URL Models ของ Google");
      assert.equal(options.headers["x-goog-api-key"], "valid-mock-key-1234567890", "ต้องส่ง key ผ่าน header x-goog-api-key");
      assert.ok(!url.includes("key="), "ห้ามส่ง key ใน query string");
      return {
        status: 200,
        ok: true,
      };
    };

    try {
      const result = await validateGeminiKey("valid-mock-key-1234567890");
      assert.equal(result.status, "valid");
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test("ตอบสถานะ 'invalid' เมื่อ Google API ตอบ 400 หรือ 403", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 403,
      ok: false,
    });

    try {
      const result = await validateGeminiKey("bad-key-sample-1234567890");
      assert.equal(result.status, "invalid");
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test("ตอบสถานะ 'quota' เมื่อ Google API ตอบ 429", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 429,
      ok: false,
    });

    try {
      const result = await validateGeminiKey("quota-key-sample-1234567890");
      assert.equal(result.status, "quota");
    } finally {
      global.fetch = originalFetch;
    }
  });

  await t.test("ตอบสถานะ 'unreachable' เมื่อ Timeout หรือ Network Error / 5xx", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error("Network timeout / unreachable");
    };

    try {
      const result = await validateGeminiKey("timeout-key-sample-1234567890");
      assert.equal(result.status, "unreachable");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("⏱️ RATE LIMITER: ควบคุมปริมาณคำขอ (Sliding Window)", async (t) => {
  const limiter = new InMemoryRateLimiter();
  const testKey = "user_test_1";

  await t.test("อนุญาตคำขอไม่เกินจำนวนที่กำหนด และปฏิเสธเมื่อเกินลิมิต", () => {
    // กำหนดให้ได้สูงสุด 3 ครั้งใน 10 วินาที
    const maxRequests = 3;
    const windowMs = 10000;

    const r1 = limiter.check(testKey, maxRequests, windowMs);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = limiter.check(testKey, maxRequests, windowMs);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = limiter.check(testKey, maxRequests, windowMs);
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    // ครั้งที่ 4 ต้องถูกปฏิเสธ
    const r4 = limiter.check(testKey, maxRequests, windowMs);
    assert.equal(r4.allowed, false);
    assert.ok(r4.retryAfterSeconds > 0, "ต้องระบุ retryAfterSeconds");
  });

  await t.test("แยกโควต้าระหว่างผู้ใช้ต่างคนอย่างอิสระ", () => {
    const otherUser = "user_test_2";
    const res = limiter.check(otherUser, 3, 10000);
    assert.equal(res.allowed, true, "ผู้ใช้อื่นต้องไม่ได้รับผลกระทบจากโควต้าของผู้ใช้คนแรก");
  });
});
