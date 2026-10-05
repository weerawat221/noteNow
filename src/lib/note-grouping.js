/**
 * ฟังก์ชันสำหรับการจัดกลุ่มโน้ต (Grouping), ค้นหา (Search), กรอง (Filter) และจัดเรียง (Sort)
 * ตามข้อกำหนด:
 * 1. โน้ตประเภท Draw ('D') และ Highlight ('H') ที่มีระยะเวลาใกล้กัน (เว้นระยะเวลาไม่เกิน 1 นาที หรือ 60 วินาที)
 *    ในหน้าเดียวกัน ให้จัดเป็นกลุ่มเดียวกัน
 * 2. การตั้งชื่อกลุ่ม:
 *    - Draw: Page[n]_Draw[i] เช่น Page11_Draw3 (หน้าที่ 11 กลุ่มที่ 3)
 *    - Highlight: Page[n]_highlight[i] เช่น Page3_highlight5 (หน้าที่ 3 กลุ่มที่ 5)
 * 3. Text Note ('T') แสดงข้อความตามปกติ
 * 4. การค้นหา (Search): ค้นหาได้เฉพาะโน้ตที่เป็น Text Note เท่านั้น
 */

export const GROUPING_WINDOW_MS = 2500;

/**
 * จัดกลุ่มโน้ตทั้งหมดของเอกสาร
 * 
 * @param {Array} rawNotes - รายการโน้ตดิบจาก API
 * @param {number} [windowMs=60000] - ช่วงเวลาสูงสุดระหว่างโน้ตที่จะนับเป็นกลุ่มเดียวกัน (มิลลิวินาที)
 * @returns {Array<object>} รายการโน้ตและกลุ่มโน้ตที่จัดระเบียบแล้ว
 */
export function groupDocumentNotes(rawNotes = [], windowMs = GROUPING_WINDOW_MS) {
  if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
    return [];
  }

  // แยกโน้ตตามหน้า (Page Number)
  const notesByPage = new Map();
  for (const note of rawNotes) {
    const pageNum = Number(note.page_number) || 1;
    if (!notesByPage.has(pageNum)) {
      notesByPage.set(pageNum, []);
    }
    notesByPage.get(pageNum).push(note);
  }

  // เรียงลำดับเลขหน้าจากน้อยไปมากสำหรับการคำนวณกลุ่ม
  const sortedPages = Array.from(notesByPage.keys()).sort((a, b) => a - b);
  const resultItems = [];

  for (const pageNum of sortedPages) {
    const pageNotes = notesByPage.get(pageNum);

    // 1. จัดกลุ่ม Draw Notes ('D') ประจำหน้านี้
    const drawNotes = pageNotes
      .filter((n) => n.note_type === "D")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let currentDrawGroup = null;
    let drawGroupCount = 0;

    for (const note of drawNotes) {
      const noteTime = new Date(note.created_at).getTime();

      if (!currentDrawGroup) {
        drawGroupCount += 1;
        currentDrawGroup = {
          id: `page_${pageNum}_draw_${drawGroupCount}`,
          pageNumber: pageNum,
          type: "D",
          groupIndex: drawGroupCount,
          title: `Page${pageNum}_Draw${drawGroupCount}`,
          notes: [note],
          noteIds: [note.note_id],
          color: note.color,
          firstCreatedAt: note.created_at,
          lastCreatedAt: note.created_at,
          startTime: noteTime,
          lastTime: noteTime,
        };
      } else {
        const timeDiff = noteTime - currentDrawGroup.lastTime;
        if (timeDiff <= windowMs) {
          // อยู่ในช่วงเวลาไม่เกิน 1 นาที -> จัดเป็นกลุ่มเดียวกัน
          currentDrawGroup.notes.push(note);
          currentDrawGroup.noteIds.push(note.note_id);
          currentDrawGroup.lastTime = noteTime;
          currentDrawGroup.lastCreatedAt = note.created_at;
        } else {
          // เกิน 1 นาที -> บันทึกกลุ่มเดิม และเริ่มกลุ่มใหม่
          resultItems.push(currentDrawGroup);
          drawGroupCount += 1;
          currentDrawGroup = {
            id: `page_${pageNum}_draw_${drawGroupCount}`,
            pageNumber: pageNum,
            type: "D",
            groupIndex: drawGroupCount,
            title: `Page${pageNum}_Draw${drawGroupCount}`,
            notes: [note],
            noteIds: [note.note_id],
            color: note.color,
            firstCreatedAt: note.created_at,
            lastCreatedAt: note.created_at,
            startTime: noteTime,
            lastTime: noteTime,
          };
        }
      }
    }
    if (currentDrawGroup) {
      resultItems.push(currentDrawGroup);
    }

    // 2. จัดกลุ่ม Highlight Notes ('H') ประจำหน้านี้
    const highlightNotes = pageNotes
      .filter((n) => n.note_type === "H")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let currentHighlightGroup = null;
    let highlightGroupCount = 0;

    for (const note of highlightNotes) {
      const noteTime = new Date(note.created_at).getTime();

      if (!currentHighlightGroup) {
        highlightGroupCount += 1;
        currentHighlightGroup = {
          id: `page_${pageNum}_highlight_${highlightGroupCount}`,
          pageNumber: pageNum,
          type: "H",
          groupIndex: highlightGroupCount,
          title: `Page${pageNum}_highlight${highlightGroupCount}`,
          notes: [note],
          noteIds: [note.note_id],
          color: note.color,
          firstCreatedAt: note.created_at,
          lastCreatedAt: note.created_at,
          startTime: noteTime,
          lastTime: noteTime,
        };
      } else {
        const timeDiff = noteTime - currentHighlightGroup.lastTime;
        if (timeDiff <= windowMs) {
          // อยู่ในช่วงเวลาไม่เกิน 1 นาที -> จัดเป็นกลุ่มเดียวกัน
          currentHighlightGroup.notes.push(note);
          currentHighlightGroup.noteIds.push(note.note_id);
          currentHighlightGroup.lastTime = noteTime;
          currentHighlightGroup.lastCreatedAt = note.created_at;
        } else {
          // เกิน 1 นาที -> เริ่มกลุ่มใหม่
          resultItems.push(currentHighlightGroup);
          highlightGroupCount += 1;
          currentHighlightGroup = {
            id: `page_${pageNum}_highlight_${highlightGroupCount}`,
            pageNumber: pageNum,
            type: "H",
            groupIndex: highlightGroupCount,
            title: `Page${pageNum}_highlight${highlightGroupCount}`,
            notes: [note],
            noteIds: [note.note_id],
            color: note.color,
            firstCreatedAt: note.created_at,
            lastCreatedAt: note.created_at,
            startTime: noteTime,
            lastTime: noteTime,
          };
        }
      }
    }
    if (currentHighlightGroup) {
      resultItems.push(currentHighlightGroup);
    }

    // 3. รายการ Text Notes ('T') (แยกเป็นรายชิ้น ไม่จัดกลุ่มเวลา)
    const textNotes = pageNotes.filter((n) => n.note_type === "T");
    for (const note of textNotes) {
      const noteTime = new Date(note.created_at).getTime();
      const rawText = note.content?.text || "";
      resultItems.push({
        id: `note_${note.note_id}`,
        noteId: note.note_id,
        noteIds: [note.note_id],
        pageNumber: pageNum,
        type: "T",
        title: rawText || "(ข้อความว่างเปล่า)",
        text: rawText,
        notes: [note],
        color: note.color,
        firstCreatedAt: note.created_at,
        lastCreatedAt: note.created_at,
        startTime: noteTime,
        lastTime: noteTime,
      });
    }
  }

  return resultItems;
}

/**
 * ค้นหา กรอง และจัดเรียงโน้ต
 * 
 * @param {Array} items - รายการโน้ตและกลุ่มที่ผ่าน groupDocumentNotes แล้ว
 * @param {object} options
 * @param {string} [options.searchQuery=""] - ค้นหาข้อความ (ค้นหาได้เฉพาะ Text Notes เท่านั้น)
 * @param {string} [options.filterType="all"] - 'all' | 'T' | 'D' | 'H'
 * @param {number|string} [options.filterPage="all"] - 'all' หรือเลขหน้า (number)
 * @param {string} [options.sortBy="page_asc"] - 'page_asc' | 'page_desc' | 'time_desc' | 'time_asc'
 * @returns {Array} รายการที่ผ่านการค้นหา กรอง และจัดเรียงแล้ว
 */
export function filterAndSortNotes(items = [], {
  searchQuery = "",
  filterType = "all",
  filterPage = "all",
  sortBy = "page_asc",
} = {}) {
  let filtered = [...items];

  // 1. การค้นหา (Search) — กฎ: ค้นหาได้เฉพาะโน้ตที่เป็นข้อความ (Text Note) เท่านั้น
  const trimmedSearch = String(searchQuery || "").trim().toLowerCase();
  if (trimmedSearch) {
    filtered = filtered.filter((item) => {
      // ตัดประเภทที่ไม่ใช่ 'T' ออกทันทีเมื่อมีการค้นหา
      if (item.type !== "T") return false;
      const textToSearch = (item.text || item.title || "").toLowerCase();
      return textToSearch.includes(trimmedSearch);
    });
  }

  // 2. กรองตามประเภท (Type Filter)
  if (filterType && filterType !== "all") {
    filtered = filtered.filter((item) => item.type === filterType);
  }

  // 3. กรองตามเลขหน้า (Page Filter)
  if (filterPage && filterPage !== "all") {
    const targetPage = Number(filterPage);
    if (!isNaN(targetPage) && targetPage > 0) {
      filtered = filtered.filter((item) => item.pageNumber === targetPage);
    }
  }

  // 4. การจัดเรียง (Sorting)
  filtered.sort((a, b) => {
    switch (sortBy) {
      case "page_desc":
        // หน้ามาก -> หน้าน้อย (หากหน้าเดียวกัน ให้เรียงตามเวลาเก่า -> ใหม่)
        if (b.pageNumber !== a.pageNumber) {
          return b.pageNumber - a.pageNumber;
        }
        return a.startTime - b.startTime;

      case "time_desc":
        // เวลาใหม่ล่าสุด -> เก่าสุด
        return b.startTime - a.startTime;

      case "time_asc":
        // เวลาเก่าสุด -> ใหม่ล่าสุด
        return a.startTime - b.startTime;

      case "page_asc":
      default:
        // หน้า 1 -> หน้าท้ายสุด (หากหน้าเดียวกัน ให้เรียงตามเวลาเก่า -> ใหม่)
        if (a.pageNumber !== b.pageNumber) {
          return a.pageNumber - b.pageNumber;
        }
        return a.startTime - b.startTime;
    }
  });

  return filtered;
}
