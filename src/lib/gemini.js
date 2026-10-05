import "server-only";
import { createAdminClient } from "./supabase/admin.js";
import { decryptSecret } from "./secrets.js";

/**
 * ตรวจสอบความถูกต้องและสถานะของ Gemini API Key กับ Google API
 * 
 * @param {string} apiKey - API Key ของ Gemini ที่ต้องการตรวจสอบ
 * @returns {Promise<{ status: 'valid' | 'invalid' | 'quota' | 'unreachable', message: string }>}
 */
export async function validateGeminiKey(apiKey) {
  if (typeof apiKey !== "string") {
    return {
      status: "invalid",
      message: "รูปแบบข้อมูล API Key ไม่ถูกต้อง",
    };
  }

  const trimmedKey = apiKey.trim();

  // 1. ตรวจสอบรูปแบบแบบหลวม ๆ:
  // - ความยาวต้องสมเหตุสมผล (20 - 200 ตัวอักษร)
  // - ต้องไม่มีช่องว่าง (whitespace) หรือการขึ้นบรรทัดใหม่
  // - ห้ามบังคับเงื่อนไข AIza เพื่อรองรับการเปลี่ยนแปลงของ Google ในอนาคต
  if (trimmedKey.length < 20 || trimmedKey.length > 200 || /\s/.test(trimmedKey)) {
    return {
      status: "invalid",
      message: "รูปแบบ API Key ไม่ถูกต้อง (ต้องมีความยาวระหว่าง 20-200 ตัวอักษรและไม่มีช่องว่าง)",
    };
  }

  // 2. เรียก Google API endpoint: models.list เพื่อตรวจสอบสิทธิ์โดยไม่เสียค่าใช้จ่าย token
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 วินาที

  try {
    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        // ส่งผ่าน Header เสมอ ห้ามใส่ใน query string เด็ดขาด
        "x-goog-api-key": trimmedKey,
        "Accept": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    // 4 สถานะมาตรฐาน
    if (res.status === 200) {
      return {
        status: "valid",
        message: "Gemini API Key ใช้งานได้ปกติและพร้อมให้บริการ",
      };
    }

    if (res.status === 400 || res.status === 403) {
      return {
        status: "invalid",
        message: "Gemini API Key ไม่ถูกต้อง ถูกระงับ หรือไม่มีสิทธิ์เข้าถึงบริการ",
      };
    }

    if (res.status === 429) {
      return {
        status: "quota",
        message: "Gemini API Key ใช้งานเกินโควต้าชั่วคราว (Quota Exceeded) กรุณาตรวจสอบโควต้าใน Google AI Studio",
      };
    }

    // กรณี Server ฝั่ง Google ตอบ 5xx หรือสถานะอื่น
    return {
      status: "unreachable",
      message: "ไม่สามารถตรวจสอบสิทธิ์กับ Google ได้ในขณะนี้ (ระบบขัดข้องชั่วคราว)",
    };
  } catch (error) {
    clearTimeout(timeoutId);

    // หากเกิด AbortError (Timeout) หรือ Network Error
    return {
      status: "unreachable",
      message: "การเชื่อมต่อไปยัง Google หมดเวลาหรือระบบเครือข่ายขัดข้อง กรุณาลองใหม่อีกครั้ง",
    };
  }
}

/**
 * ดึงและถอดรหัส Gemini API Key ของผู้ใช้จากฐานข้อมูล
 * ไม่เก็บ plaintext ไว้ในตัวแปรระดับโมดูลหรือ global memory
 * 
 * @param {string|number} userId - users.user_id หรือ auth_id
 * @returns {Promise<string|null>} - Plaintext Gemini API Key หรือ null หากไม่ได้ตั้งค่า
 */
export async function getUserGeminiKey(userId) {
  if (!userId) return null;

  const admin = createAdminClient();

  // รองรับการค้นหาได้ทั้งจาก user_id (bigint) และ auth_id (uuid)
  let query = admin.from("users").select("user_id, gemini_api_key_enc");
  if (typeof userId === "number" || /^\d+$/.test(String(userId))) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("auth_id", userId);
  }

  const { data: userRow, error } = await query.maybeSingle();

  if (error || !userRow || !userRow.gemini_api_key_enc) {
    return null;
  }

  try {
    // ถอดรหัสด้วย userId จริงจากตาราง users เพื่อเป็น AAD
    return decryptSecret(userRow.gemini_api_key_enc, {
      userId: userRow.user_id,
    });
  } catch (decryptErr) {
    // Log เฉพาะเหตุการณ์ ห้าม log ciphertext หรือ secret
    console.error(
      JSON.stringify({
        event: "gemini_key_decryption_failed",
        userId: userRow.user_id,
        timestamp: new Date().toISOString(),
      })
    );
    return null;
  }
}
