/**
 * Error Codes และข้อความภาษาไทยสำหรับการสรุปเอกสารด้วย Gemini (NoteNow)
 * ป้องกันการเปิดเผย Error ดิบหรือ Key จาก Google / Drive ไปยัง Client
 */
export const SUMMARY_ERRORS = {
  GEMINI_KEY_MISSING: {
    code: "GEMINI_KEY_MISSING",
    status: 400,
    message: "คุณยังไม่ได้ตั้งค่า Gemini API Key ในระบบ กรุณาไปที่หน้าตั้งค่าเพื่อเพิ่ม Key",
  },
  GEMINI_KEY_INVALID: {
    code: "GEMINI_KEY_INVALID",
    status: 400,
    message: "Gemini API Key ใช้งานไม่ได้หรือถูกปฏิเสธสิทธิ์ กรุณาตรวจสอบหรือใส่ Key ใหม่ในหน้าตั้งค่า",
  },
  GEMINI_QUOTA: {
    code: "GEMINI_QUOTA",
    status: 429,
    message: "Gemini API Key ติดโควต้าการใช้งาน (Resource Exhausted) กรุณารอสักครู่หรือตรวจสอบใน Google AI Studio",
  },
  DRIVE_AUTH: {
    code: "DRIVE_AUTH",
    status: 401,
    message: "การเชื่อมต่อ Google Drive หมดอายุหรือถูกเพิกถอนสิทธิ์ กรุณาออกจากระบบแล้วเข้าสู่ระบบ Google ใหม่อีกครั้ง",
  },
  DRIVE_NOT_FOUND: {
    code: "DRIVE_NOT_FOUND",
    status: 404,
    message: "ไม่พบไฟล์บน Google Drive หรือคุณไม่มีสิทธิ์เข้าถึงไฟล์นี้ กรุณาตรวจสอบไฟล์ใน Google Drive",
  },
  NOT_A_PDF: {
    code: "NOT_A_PDF",
    status: 400,
    message: "ไฟล์นี้ไม่ใช่เอกสาร PDF ระบบรองรับเฉพาะไฟล์ประเภท PDF เท่านั้น",
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    status: 400,
    message: "ไฟล์มีขนาดใหญ่เกินเพดานที่ระบบรองรับ (จำกัดขนาดไม่เกิน 30 MB สำหรับการสรุป)",
  },
  DOCUMENT_TOO_LONG: {
    code: "DOCUMENT_TOO_LONG",
    status: 400,
    message: "เอกสารมีเนื้อหายาวเกินกว่าจะสรุปได้ในครั้งเดียว (เกินเพดาน 1,000,000 Tokens)",
  },
  PDF_UNREADABLE: {
    code: "PDF_UNREADABLE",
    status: 400,
    message: "ไม่สามารถอ่านเนื้อหาในไฟล์ PDF ได้ เอกสารอาจถูกตั้งรหัสผ่านป้องกันหรือโครงสร้างไฟล์เสียหาย",
  },
  SUMMARY_BLOCKED: {
    code: "SUMMARY_BLOCKED",
    status: 400,
    message: "ระบบไม่สามารถสรุปเอกสารนี้ได้ เนื่องจากเนื้อหาติดนโยบายความปลอดภัย (Safety Policy) ของ Google",
  },
  BUSY: {
    code: "BUSY",
    status: 429,
    message: "มีงานสรุปสำหรับเอกสารนี้กำลังดำเนินการอยู่ กรุณารอให้งานปัจจุบันเสร็จสิ้น",
  },
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    status: 429,
    message: "คุณใช้งานสรุปเนื้อหาเกินโควต้าที่กำหนด (สูงสุด 10 ครั้งต่อชั่วโมง) กรุณารอสักครู่แล้วลองใหม่",
  },
  GLOBAL_CAP: {
    code: "BUSY",
    status: 503,
    message: "ระบบกำลังประมวลผลงานสรุปหลายงานพร้อมกัน กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
  },
  UPSTREAM_UNAVAILABLE: {
    code: "UPSTREAM_UNAVAILABLE",
    status: 503,
    message: "ไม่สามารถเชื่อมต่อไปยังเซิร์ฟเวอร์ภายนอกได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง (ระบบไม่ได้เกิดจากปัญหาของ Key)",
  },
};

/**
 * แปลง Exception หรือ Error object ให้เป็น Summary Error Code มาตรฐาน
 */
export function parseSummaryError(err) {
  if (!err) {
    return SUMMARY_ERRORS.UPSTREAM_UNAVAILABLE;
  }

  // หากเป็น custom error ที่มี code อยู่แล้ว (เช่น จาก summary-drive หรือ gemini-summary)
  if (err.code && SUMMARY_ERRORS[err.code]) {
    return SUMMARY_ERRORS[err.code];
  }

  const msg = String(err.message || "").toLowerCase();

  // ตรวจสอบโมเดล Gemini ไม่พร้อมใช้งานหรือ deprecated
  if (
    msg.includes("model") &&
    (msg.includes("not found") ||
      msg.includes("not_found") ||
      msg.includes("no longer available") ||
      msg.includes("not supported") ||
      msg.includes("404"))
  ) {
    return {
      code: "UPSTREAM_UNAVAILABLE",
      status: 503,
      message: "โมเดล AI ที่ระบุไม่พร้อมใช้งานในขณะนี้ กรุณาลองใหม่อีกครั้ง",
    };
  }

  if (
    msg.includes("api_key_invalid") ||
    msg.includes("api key not valid") ||
    msg.includes("permission_denied") ||
    msg.includes("403")
  ) {
    return SUMMARY_ERRORS.GEMINI_KEY_INVALID;
  }

  if (msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("429")) {
    return SUMMARY_ERRORS.GEMINI_QUOTA;
  }

  if (
    msg.includes("drive_auth") ||
    msg.includes("invalid_grant") ||
    msg.includes("unauthorized")
  ) {
    return SUMMARY_ERRORS.DRIVE_AUTH;
  }

  // DRIVE_NOT_FOUND เฉพาะเมื่อ Error มาจาก Google Drive API เท่านั้น
  if (msg.includes("drive") && (msg.includes("not found") || msg.includes("404"))) {
    return SUMMARY_ERRORS.DRIVE_NOT_FOUND;
  }

  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("content_filter")) {
    return SUMMARY_ERRORS.SUMMARY_BLOCKED;
  }

  if (
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("503") ||
    msg.includes("unavailable")
  ) {
    return SUMMARY_ERRORS.UPSTREAM_UNAVAILABLE;
  }

  return SUMMARY_ERRORS.UPSTREAM_UNAVAILABLE;
}
