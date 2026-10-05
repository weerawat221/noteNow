/**
 * Configuration สำหรับระบบสรุปทั้งเอกสารด้วย Gemini (NoteNow)
 * รวมค่าพารามิเตอร์ เพดานขนาดไฟล์ โควต้า และ Timeout ทั้งหมดไว้ที่จุดเดียว
 */
const rawEnvModel = process.env.GEMINI_MODEL_NAME;
// หาก env ว่างหรือเป็นโมเดลรุ่นเก่าที่เลิกให้บริการ ให้ใช้ gemini-3.5-flash-lite เพื่อความรวดเร็วและไม่ติด 503 High Demand
const resolvedModel =
  !rawEnvModel ||
  rawEnvModel === "gemini-2.0-flash" ||
  rawEnvModel === "gemini-2.5-flash" ||
  rawEnvModel === "gemini-2.5-flash-lite" ||
  rawEnvModel === "gemini-1.5-flash"
    ? "gemini-3.5-flash-lite"
    : rawEnvModel;

export const SUMMARY_CONFIG = {
  // Model Name
  MODEL_NAME: resolvedModel,

  // Model Generation Parameters
  TEMPERATURE: 0.3,
  MAX_OUTPUT_TOKENS: 4096,

  // ขนาดไฟล์สูงสุดที่ระบบอนุญาตให้ส่งสรุป (30 MB)
  MAX_FILE_SIZE_BYTES: 30 * 1024 * 1024,

  // ขนาดไฟล์สูงสุดที่ส่งแบบ Inline Base64 (10 MB)
  // ไฟล์ที่ <= 10MB ส่ง inline ช่วยลด Latency และลดภาระ Files API
  // ไฟล์ที่ > 10MB ถึง 30MB จะถูกอัปโหลดผ่าน Gemini Files API
  INLINE_PDF_SIZE_LIMIT_BYTES: 10 * 1024 * 1024,

  // เพดาน Token สูงสุดของเอกสาร (เพื่อป้องกันค่าใช้จ่ายบานปลายของผู้ใช้)
  MAX_INPUT_TOKENS: 1_000_000,

  // Timeout ควบคุมแต่ละขั้นตอน (มิลลิวินาที)
  TOTAL_PIPELINE_TIMEOUT_MS: 120_000, // 120 วินาที รวมทั้งกระบวนการ
  DRIVE_DOWNLOAD_TIMEOUT_MS: 45_000,  // ดาวน์โหลดจาก Drive ไม่เกิน 45 วินาที
  GEMINI_UPLOAD_TIMEOUT_MS: 45_000,   // อัปโหลดขึ้น Files API ไม่เกิน 45 วินาที
  GEMINI_STREAM_TIMEOUT_MS: 90_000,   // รอ Stream สรุปผลไม่เกิน 90 วินาที

  // การจำกัดอัตราการเรียกใช้งาน (Rate Limits & Concurrency)
  USER_RATE_LIMIT_MAX_PER_HOUR: 10,   // ผู้ใช้ละไม่เกิน 10 ครั้งต่อชั่วโมง
  USER_RATE_LIMIT_WINDOW_SECONDS: 3600,
  GLOBAL_CONCURRENCY_CAP: 10,         // จำกัดงานสรุปพร้อมกันทั้งระบบไม่เกิน 10 งาน

  // ภาษาและโครงสร้างผลลัพธ์เริ่มต้น
  SUMMARY_LANGUAGE: "th",
};
