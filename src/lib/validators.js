/**
 * ตรวจสอบ content ของ note ตาม note_type
 *
 * T (text):      { text: "..." }
 * D (drawing):   { points: [{x, y}, ...], width: number }
 * H (highlight): { rects: [{x, y, w, h}, ...], text: "..." }
 *
 * ค่าพิกัดทั้งหมดต้องเป็น 0.0–1.0 (relative to page)
 */

function isNormalized(val) {
  return typeof val === "number" && val >= 0 && val <= 1;
}

export function validateNoteContent(noteType, content) {
  if (!content || typeof content !== "object") {
    return { valid: false, error: "content ต้องเป็น object" };
  }

  switch (noteType) {
    case "T": {
      if (typeof content.text !== "string" || content.text.trim().length === 0) {
        return { valid: false, error: "T note ต้องมี text ที่ไม่ว่าง" };
      }
      return { valid: true };
    }

    case "D": {
      if (!Array.isArray(content.points) || content.points.length < 2) {
        return { valid: false, error: "D note ต้องมี points อย่างน้อย 2 จุด" };
      }
      for (const pt of content.points) {
        if (!isNormalized(pt.x) || !isNormalized(pt.y)) {
          return {
            valid: false,
            error: "จุดทุกจุดต้องมีค่า x, y ระหว่าง 0 ถึง 1",
          };
        }
      }
      if (typeof content.width !== "number" || content.width <= 0) {
        return { valid: false, error: "D note ต้องมี width ที่มากกว่า 0" };
      }
      return { valid: true };
    }

    case "H": {
      if (!Array.isArray(content.rects) || content.rects.length === 0) {
        return {
          valid: false,
          error: "H note ต้องมี rects อย่างน้อย 1 ช่อง",
        };
      }
      for (const rect of content.rects) {
        if (
          !isNormalized(rect.x) ||
          !isNormalized(rect.y) ||
          typeof rect.w !== "number" ||
          rect.w <= 0 ||
          typeof rect.h !== "number" ||
          rect.h <= 0
        ) {
          return {
            valid: false,
            error: "rect แต่ละตัวต้องมี x, y (0–1) และ w, h ที่มากกว่า 0",
          };
        }
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `note_type '${noteType}' ไม่ถูกต้อง (ต้องเป็น T, D, หรือ H)` };
  }
}
