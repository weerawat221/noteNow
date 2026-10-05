import "server-only";
import { GoogleGenAI } from "@google/genai";
import { SUMMARY_CONFIG } from "../config/summary.js";
import { SUMMARY_SYSTEM_INSTRUCTION } from "./summaryPrompt.js";

/**
 * อัปโหลดไฟล์ PDF ขึ้น Gemini Files API สำหรับไฟล์ที่มีขนาดใหญ่กว่าเกณฑ์ Inline
 * 
 * @param {string} apiKey - Gemini API Key ของผู้ใช้
 * @param {Buffer} buffer - ข้อมูลไฟล์ PDF
 * @param {string} displayName - ชื่อสำหรับแสดงผล
 * @param {AbortSignal} [signal] 
 * @returns {Promise<{ uri: string, name: string }>}
 */
export async function uploadToGeminiFilesApi(apiKey, buffer, displayName, signal) {
  const initUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";

  // Step 1: Start Resumable Upload
  const initRes = await fetch(initUrl, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buffer.length),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: { display_name: displayName.slice(0, 100) },
    }),
    signal,
  });

  if (initRes.status === 400 || initRes.status === 403) {
    const err = new Error("Gemini API Key ไม่ถูกต้องหรือถูกปฏิเสธสิทธิ์");
    err.code = "GEMINI_KEY_INVALID";
    throw err;
  }
  if (initRes.status === 429) {
    const err = new Error("Gemini API Key ติดโควต้า");
    err.code = "GEMINI_QUOTA";
    throw err;
  }
  if (!initRes.ok) {
    const err = new Error("เริ่มต้นอัปโหลดไฟล์ไปยัง Gemini Files API ไม่สำเร็จ");
    err.code = "UPSTREAM_UNAVAILABLE";
    throw err;
  }

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    const err = new Error("ไม่ได้รับ Upload URL จาก Gemini");
    err.code = "UPSTREAM_UNAVAILABLE";
    throw err;
  }

  // Step 2: Upload Buffer
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Length": String(buffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
    signal,
  });

  if (!uploadRes.ok) {
    const err = new Error("ส่งข้อมูลไฟล์ไปยัง Gemini Files API ไม่สำเร็จ");
    err.code = "UPSTREAM_UNAVAILABLE";
    throw err;
  }

  const uploadData = await uploadRes.json();
  const file = uploadData.file;

  if (!file || !file.uri || !file.name) {
    const err = new Error("ข้อมูลไฟล์จาก Gemini ไม่สมบูรณ์");
    err.code = "UPSTREAM_UNAVAILABLE";
    throw err;
  }

  // Step 3: Wait until ACTIVE (timeout 30s)
  const startTime = Date.now();
  let currentFile = file;

  while (currentFile.state === "PROCESSING") {
    if (Date.now() - startTime > 30000) {
      const err = new Error("การประมวลผลไฟล์ PDF ของ Gemini ใช้เวลานานเกินไป");
      err.code = "UPSTREAM_UNAVAILABLE";
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${currentFile.name}`,
      {
        headers: { "x-goog-api-key": apiKey },
        signal,
      }
    );

    if (checkRes.ok) {
      currentFile = await checkRes.json();
    }
  }

  if (currentFile.state === "FAILED") {
    const err = new Error("Gemini ไม่สามารถประมวลผลไฟล์ PDF นี้ได้ (ไฟล์อาจมีรหัสผ่านหรือเสียหาย)");
    err.code = "PDF_UNREADABLE";
    throw err;
  }

  return {
    uri: currentFile.uri,
    name: currentFile.name, // เช่น files/abc123xyz
  };
}

/**
 * ลบไฟล์ออกจาก Gemini Files API (Best-effort ใน finally block)
 * 
 * @param {string} apiKey 
 * @param {string} fileName - เช่น "files/abc123xyz"
 */
export async function deleteGeminiFile(apiKey, fileName) {
  if (!apiKey || !fileName) return;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/${fileName}`;
    await fetch(url, {
      method: "DELETE",
      headers: { "x-goog-api-key": apiKey },
    });
    console.log(
      JSON.stringify({
        event: "gemini_file_deleted",
        fileName,
        timestamp: new Date().toISOString(),
      })
    );
  } catch {
    console.warn(
      JSON.stringify({
        event: "gemini_file_delete_failed",
        fileName,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

/**
 * สร้าง Gemini Content Part สำหรับเอกสาร PDF (Inline หรือ FileData)
 * 
 * @param {string} apiKey 
 * @param {Buffer} pdfBuffer 
 * @param {string} displayName 
 * @param {AbortSignal} [signal] 
 * @returns {Promise<{ part: object, uploadedFileName: string|null }>}
 */
export async function preparePdfPart(apiKey, pdfBuffer, displayName, signal) {
  // หากไฟล์เล็กกว่าเกณฑ์ ให้ส่งแบบ Inline Base64 (เร็ว ประหยัดรอบเครือข่าย)
  if (pdfBuffer.length <= SUMMARY_CONFIG.INLINE_PDF_SIZE_LIMIT_BYTES) {
    return {
      part: {
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBuffer.toString("base64"),
        },
      },
      uploadedFileName: null,
    };
  }

  // หากไฟล์ขนาดระหว่าง 10 MB ถึง 30 MB ให้อัปโหลดขึ้น Files API
  const uploaded = await uploadToGeminiFilesApi(apiKey, pdfBuffer, displayName, signal);
  return {
    part: {
      fileData: {
        mimeType: "application/pdf",
        fileUri: uploaded.uri,
      },
    },
    uploadedFileName: uploaded.name,
  };
}

/**
 * นับจำนวน Token ของเอกสารก่อนเริ่มสร้างสรุป
 * 
 * @param {GoogleGenAI} ai 
 * @param {object} filePart 
 * @returns {Promise<number>}
 */
export async function verifyTokenCount(ai, filePart) {
  try {
    const countRes = await ai.models.countTokens({
      model: SUMMARY_CONFIG.MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [
            filePart,
            { text: "โปรดสรุปเนื้อหาของเอกสารนี้" },
          ],
        },
      ],
    });

    const totalTokens = countRes.totalTokens || 0;
    if (totalTokens > SUMMARY_CONFIG.MAX_INPUT_TOKENS) {
      const err = new Error(
        `เอกสารมีขนาด ${totalTokens.toLocaleString()} tokens ซึ่งเกินเพดานที่ระบบอนุญาต (${SUMMARY_CONFIG.MAX_INPUT_TOKENS.toLocaleString()} tokens)`
      );
      err.code = "DOCUMENT_TOO_LONG";
      throw err;
    }

    return totalTokens;
  } catch (err) {
    if (err.code === "DOCUMENT_TOO_LONG") throw err;

    const msg = String(err.message || "").toLowerCase();
    if (msg.includes("400") || msg.includes("api_key_invalid") || msg.includes("403")) {
      const authErr = new Error("Gemini API Key ไม่ถูกต้อง");
      authErr.code = "GEMINI_KEY_INVALID";
      throw authErr;
    }
    if (msg.includes("429") || msg.includes("resource_exhausted")) {
      const quotaErr = new Error("Gemini API Key ติดโควต้า");
      quotaErr.code = "GEMINI_QUOTA";
      throw quotaErr;
    }

    // กรณี countTokens ไม่สำเร็จ (เช่น 503 ชั่วคราว) ให้ log เตือนแต่ยอมให้ดำเนินการต่อ
    console.warn("Could not pre-count tokens:", msg);
    return 0;
  }
}

/**
 * สตรีมเนื้อหาสรุปด้วยโมเดล Gemini พร้อมระบบ Auto-Fallback ป้องกันปัญหา 503 High Demand
 * 
 * @param {GoogleGenAI} ai 
 * @param {object} prepPart 
 * @param {string} systemInstruction 
 * @param {AbortSignal} [signal] 
 * @returns {AsyncGenerator<{ chunk: any, model: string }>}
 */
export async function* streamGeminiWithFallback(ai, prepPart, systemInstruction, signal) {
  // ลำดับโมเดลที่จะลองเรียก หากโมเดลหลักติด 503 (High Demand) หรือ 404
  const candidateModels = [
    SUMMARY_CONFIG.MODEL_NAME,
    "gemini-3.5-flash-lite",
    "gemini-flash-latest",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3.8-flash",
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError = null;
  let hasYieldedAnyChunk = false;

  for (const model of candidateModels) {
    if (signal?.aborted) {
      throw new Error("Client aborted");
    }

    try {
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: [
          {
            role: "user",
            parts: [
              prepPart,
              { text: "โปรดสรุปเนื้อหาสำคัญของเอกสารนี้ทั้งฉบับอย่างละเอียดตามคำสั่งที่กำหนด" },
            ],
          },
        ],
        config: {
          systemInstruction,
          temperature: SUMMARY_CONFIG.TEMPERATURE,
          maxOutputTokens: SUMMARY_CONFIG.MAX_OUTPUT_TOKENS,
        },
      });

      for await (const chunk of responseStream) {
        if (signal?.aborted) {
          throw new Error("Client aborted");
        }
        hasYieldedAnyChunk = true;
        yield { chunk, model };
      }

      // หาก stream สำเร็จสมบูรณ์ ให้ออกจากฟังก์ชันได้เลย
      return;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || "").toLowerCase();
      const is503or404 =
        err?.status === 503 ||
        err?.status === 404 ||
        err?.code === 503 ||
        err?.code === 404 ||
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("unavailable") ||
        msg.includes("not found") ||
        msg.includes("no longer available") ||
        msg.includes("spikes in demand");

      // หากยังไม่ได้ส่ง chunk แรกให้ client และเกิด 503/404 ให้ลองสลับไปใช้โมเดลสำรอง
      if (!hasYieldedAnyChunk && is503or404) {
        console.warn(
          JSON.stringify({
            event: "model_busy_trying_fallback",
            failedModel: model,
            errorMessage: err?.message,
            status: err?.status || err?.code,
            timestamp: new Date().toISOString(),
          })
        );
        continue;
      }

      // หากเริ่มปล่อยข้อความไปแล้ว หรือเป็น error ด้าน auth/safety ให้ throw ทันที
      throw err;
    }
  }

  throw lastError;
}

/**
 * Backward compatibility wrapper สำหรับ executeGenerateContentStream
 */
export async function executeGenerateContentStream(ai, prepPart, systemInstruction, signal) {
  const iterator = streamGeminiWithFallback(ai, prepPart, systemInstruction, signal);
  return {
    stream: {
      async *[Symbol.asyncIterator]() {
        for await (const { chunk } of iterator) {
          yield chunk;
        }
      },
    },
    usedModel: SUMMARY_CONFIG.MODEL_NAME,
  };
}
