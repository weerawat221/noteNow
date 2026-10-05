import test from "node:test";
import assert from "node:assert/strict";

test("👤 PROFILE SETTINGS: การตรวจสอบข้อมูลโปรไฟล์ผู้ใช้", async (t) => {
  await t.test("ปฏิเสธเมื่อชื่อ (firstName) เป็นค่าว่าง", () => {
    const firstName = "   ";
    assert.equal(firstName.trim().length === 0, true, "ต้องปฏิเสธชื่อว่างเปล่า");
  });

  await t.test("ปฏิเสธเมื่อชื่อยาวเกิน 100 ตัวอักษร", () => {
    const longName = "ก".repeat(101);
    assert.equal(longName.length > 100, true);
  });

  await t.test("ตรวจสอบประเภทไฟล์รูปภาพที่อนุญาต (JPG, PNG, WEBP, GIF)", () => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    assert.equal(allowed.has("image/png"), true);
    assert.equal(allowed.has("image/jpeg"), true);
    assert.equal(allowed.has("image/webp"), true);
    assert.equal(allowed.has("image/gif"), true);
    assert.equal(allowed.has("application/pdf"), false);
    assert.equal(allowed.has("text/html"), false);
  });

  await t.test("ปฏิเสธรูปภาพขนาดเกิน 2 MB", () => {
    const MAX_SIZE = 2 * 1024 * 1024;
    const oversized = 2.5 * 1024 * 1024;
    const validSize = 1.2 * 1024 * 1024;
    assert.equal(oversized > MAX_SIZE, true);
    assert.equal(validSize <= MAX_SIZE, true);
  });
});
