import test from "node:test";
import assert from "node:assert/strict";
import { groupDocumentNotes, filterAndSortNotes } from "../src/lib/note-grouping.js";

test("📝 NOTE GROUPING: การจัดกลุ่ม Draw และ Highlight ตามข้อกำหนด", async (t) => {
  await t.test("จัดกลุ่ม Draw ในหน้าเดียวกันที่ห่างกันไม่เกินเวลาที่กำหนดเป็น Page[n]_Draw[i]", () => {
    const baseTime = new Date("2026-10-05T10:00:00.000Z").getTime();

    const sampleNotes = [
      // กลุ่ม 1: หน้า 11 วาด 2 เส้น ห่างกัน 200 ms (ไม่เกิน 1000 ms)
      {
        note_id: 1,
        page_number: 11,
        note_type: "D",
        created_at: new Date(baseTime).toISOString(),
        color: "#4f46e5",
      },
      {
        note_id: 2,
        page_number: 11,
        note_type: "D",
        created_at: new Date(baseTime + 200).toISOString(),
        color: "#4f46e5",
      },

      // กลุ่ม 2: หน้า 11 วาดหลังจากกลุ่ม 1 ผ่านไป 5 วินาที (> 1000 ms)
      {
        note_id: 3,
        page_number: 11,
        note_type: "D",
        created_at: new Date(baseTime + 5000).toISOString(),
        color: "#dc2626",
      },

      // กลุ่ม 3: หน้า 11 วาดหลังจากกลุ่ม 2 ผ่านไป 10 วินาที -> ต้องได้ Page11_Draw3!
      {
        note_id: 4,
        page_number: 11,
        note_type: "D",
        created_at: new Date(baseTime + 15000).toISOString(),
        color: "#16a34a",
      },
      {
        note_id: 5,
        page_number: 11,
        note_type: "D",
        created_at: new Date(baseTime + 15200).toISOString(),
        color: "#16a34a",
      },
    ];

    const grouped = groupDocumentNotes(sampleNotes);
    assert.equal(grouped.length, 3, "ต้องได้ 3 กลุ่ม");

    assert.equal(grouped[0].title, "Page11_Draw1");
    assert.equal(grouped[0].notes.length, 2);
    assert.deepEqual(grouped[0].noteIds, [1, 2]);

    assert.equal(grouped[1].title, "Page11_Draw2");
    assert.equal(grouped[1].notes.length, 1);
    assert.deepEqual(grouped[1].noteIds, [3]);

    assert.equal(grouped[2].title, "Page11_Draw3");
    assert.equal(grouped[2].notes.length, 2);
    assert.deepEqual(grouped[2].noteIds, [4, 5]);
  });

  await t.test("จัดกลุ่ม Highlight ในหน้าที่ 3 ได้ Page3_highlight5", () => {
    const baseTime = new Date("2026-10-05T12:00:00.000Z").getTime();

    // สร้าง 5 กลุ่มของ highlight บนหน้าที่ 3 แต่ละกลุ่มห่างกัน 5 วินาที
    const highlightNotes = [];
    for (let i = 1; i <= 5; i++) {
      highlightNotes.push({
        note_id: i + 100,
        page_number: 3,
        note_type: "H",
        created_at: new Date(baseTime + i * 5000).toISOString(),
        color: "#fde047",
      });
    }

    const grouped = groupDocumentNotes(highlightNotes);
    assert.equal(grouped.length, 5);
    assert.equal(grouped[0].title, "Page3_highlight1");
    assert.equal(grouped[4].title, "Page3_highlight5");
    assert.deepEqual(grouped[4].noteIds, [105]);
  });

  await t.test("ค้นหาเฉพาะ Text Note เท่านั้น (Draw และ Highlight จะไม่ถูกค้นหา)", () => {
    const rawNotes = [
      {
        note_id: 10,
        page_number: 1,
        note_type: "T",
        content: { text: "สรุปการประชุมเรื่องงบประมาณประจำปี" },
        created_at: "2026-10-05T10:00:00.000Z",
      },
      {
        note_id: 11,
        page_number: 1,
        note_type: "T",
        content: { text: "ข้อตกลงสัญญาซื้อขาย" },
        created_at: "2026-10-05T10:05:00.000Z",
      },
      {
        note_id: 12,
        page_number: 1,
        note_type: "D",
        created_at: "2026-10-05T10:10:00.000Z",
      },
    ];

    const grouped = groupDocumentNotes(rawNotes);
    assert.equal(grouped.length, 3);

    // ค้นหา "งบประมาณ" -> ต้องเจอเฉพาะ Text Note #10
    const searchBudget = filterAndSortNotes(grouped, { searchQuery: "งบประมาณ" });
    assert.equal(searchBudget.length, 1);
    assert.equal(searchBudget[0].noteId, 10);
    assert.equal(searchBudget[0].type, "T");

    // ค้นหา "Draw" หรือ "Page" -> ต้องไม่เจอ Draw หรือ Highlight แม้ว่าชื่อกรุ๊ปจะมีคำว่า Draw ก็ตาม!
    const searchDraw = filterAndSortNotes(grouped, { searchQuery: "Draw" });
    assert.equal(searchDraw.length, 0, "การค้นหาต้องไม่พบ Draw กรุ๊ป");

    const searchPage = filterAndSortNotes(grouped, { searchQuery: "Page" });
    assert.equal(searchPage.length, 0, "การค้นหาต้องไม่พบกรุ๊ปที่ชื่อขึ้นต้นด้วย Page");
  });

  await t.test("การจัดเรียงตามเลขหน้าและเวลา", () => {
    const items = [
      { id: "1", pageNumber: 3, startTime: 100, type: "T" },
      { id: "2", pageNumber: 1, startTime: 300, type: "D" },
      { id: "3", pageNumber: 2, startTime: 200, type: "H" },
    ];

    // เรียงตามหน้า 1 -> N
    const pageAsc = filterAndSortNotes(items, { sortBy: "page_asc" });
    assert.deepEqual(pageAsc.map((i) => i.pageNumber), [1, 2, 3]);

    // เรียงตามหน้า N -> 1
    const pageDesc = filterAndSortNotes(items, { sortBy: "page_desc" });
    assert.deepEqual(pageDesc.map((i) => i.pageNumber), [3, 2, 1]);

    // เรียงตามเวลา ใหม่ -> เก่า
    const timeDesc = filterAndSortNotes(items, { sortBy: "time_desc" });
    assert.deepEqual(timeDesc.map((i) => i.id), ["2", "3", "1"]);
  });
});
