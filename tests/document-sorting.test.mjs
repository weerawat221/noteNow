import test from "node:test";
import assert from "node:assert/strict";

function sortDocuments(docs, fileSort) {
  return [...docs].sort((a, b) => {
    if (fileSort === "note_date_desc") {
      const aTime = a.latest_note_at ? new Date(a.latest_note_at).getTime() : 0;
      const bTime = b.latest_note_at ? new Date(b.latest_note_at).getTime() : 0;
      if (bTime !== aTime) {
        return bTime - aTime;
      }
      return new Date(b.connected_at || 0) - new Date(a.connected_at || 0);
    }
    if (fileSort === "note_date_asc") {
      const aTime = a.latest_note_at ? new Date(a.latest_note_at).getTime() : Infinity;
      const bTime = b.latest_note_at ? new Date(b.latest_note_at).getTime() : Infinity;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return new Date(a.connected_at || 0) - new Date(b.connected_at || 0);
    }
    if (fileSort === "date_desc") {
      return new Date(b.connected_at || 0) - new Date(a.connected_at || 0);
    }
    if (fileSort === "date_asc") {
      return new Date(a.connected_at || 0) - new Date(b.connected_at || 0);
    }
    if (fileSort === "name_asc") {
      return a.document_name.localeCompare(b.document_name, "th");
    }
    if (fileSort === "name_desc") {
      return b.document_name.localeCompare(a.document_name, "th");
    }
    return 0;
  });
}

test("📂 DOCUMENT SORTING: เรียงตามโน้ตล่าสุด (note_date_desc)", () => {
  const docs = [
    { document_id: 1, document_name: "Doc A (No Notes)", latest_note_at: null, connected_at: "2026-10-01T10:00:00Z" },
    { document_id: 2, document_name: "Doc B (Old Note)", latest_note_at: "2026-10-02T12:00:00Z", connected_at: "2026-10-01T09:00:00Z" },
    { document_id: 3, document_name: "Doc C (New Note)", latest_note_at: "2026-10-05T16:30:00Z", connected_at: "2026-10-01T08:00:00Z" },
    { document_id: 4, document_name: "Doc D (Medium Note)", latest_note_at: "2026-10-03T15:00:00Z", connected_at: "2026-10-01T07:00:00Z" },
    { document_id: 5, document_name: "Doc E (No Notes Newer Conn)", latest_note_at: null, connected_at: "2026-10-04T10:00:00Z" },
  ];

  const sorted = sortDocuments(docs, "note_date_desc");
  const sortedIds = sorted.map((d) => d.document_id);

  // Newest note (3) -> Medium note (4) -> Old note (2) -> No notes (5, then 1 by connected_at desc)
  assert.deepEqual(sortedIds, [3, 4, 2, 5, 1]);
});

test("📂 DOCUMENT SORTING: เรียงตามโน้ตแรกสุด (note_date_asc)", () => {
  const docs = [
    { document_id: 1, document_name: "Doc A (No Notes)", latest_note_at: null, connected_at: "2026-10-01T10:00:00Z" },
    { document_id: 2, document_name: "Doc B (Old Note)", latest_note_at: "2026-10-02T12:00:00Z", connected_at: "2026-10-01T09:00:00Z" },
    { document_id: 3, document_name: "Doc C (New Note)", latest_note_at: "2026-10-05T16:30:00Z", connected_at: "2026-10-01T08:00:00Z" },
  ];

  const sorted = sortDocuments(docs, "note_date_asc");
  const sortedIds = sorted.map((d) => d.document_id);

  // Old note (2) -> New note (3) -> No notes (1)
  assert.deepEqual(sortedIds, [2, 3, 1]);
});
