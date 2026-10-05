import test from "node:test";
import assert from "node:assert/strict";

// 1. ทดสอบการจำแนกสิทธิ์ Admin vs Regular User
function checkAdminAccess(user) {
  if (!user) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }
  if (user.is_suspended) {
    return { allowed: false, status: 403, error: "Account suspended" };
  }
  if (user.role !== "A") {
    return { allowed: false, status: 403, error: "Forbidden: Admin access required" };
  }
  return { allowed: true, status: 200 };
}

test("🛡️ ADMIN AUTH: การตรวจสอบสิทธิ์แอดมิน (role = 'A')", () => {
  // ผู้ใช้ทั่วไป
  const normalUser = { user_id: 1, role: "U", is_suspended: false };
  assert.equal(checkAdminAccess(normalUser).allowed, false);
  assert.equal(checkAdminAccess(normalUser).status, 403);

  // แอดมินปกติ
  const adminUser = { user_id: 2, role: "A", is_suspended: false };
  assert.equal(checkAdminAccess(adminUser).allowed, true);
  assert.equal(checkAdminAccess(adminUser).status, 200);

  // ผู้ใช้หรือแอดมินที่ถูกระงับ
  const suspendedAdmin = { user_id: 3, role: "A", is_suspended: true };
  assert.equal(checkAdminAccess(suspendedAdmin).allowed, false);
  assert.equal(checkAdminAccess(suspendedAdmin).status, 403);

  // ผู้ใช้ไม่ได้ล็อกอิน
  assert.equal(checkAdminAccess(null).allowed, false);
  assert.equal(checkAdminAccess(null).status, 401);
});

// 2. ทดสอบการค้นหาและกรองเอกสารของ Admin (Search & Filter)
function filterAdminDocuments(docs, search, userFilter, summaryFilter) {
  return docs.filter((doc) => {
    const q = search.toLowerCase().trim();
    if (q) {
      const docName = (doc.document_name || "").toLowerCase();
      const ownerName = `${doc.users?.first_name || ""} ${doc.users?.last_name || ""}`.toLowerCase();
      const ownerEmail = (doc.users?.email || "").toLowerCase();
      if (!docName.includes(q) && !ownerName.includes(q) && !ownerEmail.includes(q)) {
        return false;
      }
    }

    if (userFilter !== "all") {
      if (String(doc.user_id) !== String(userFilter)) return false;
    }

    if (summaryFilter === "summarized" && (!doc.ai_summaries_count || doc.ai_summaries_count === 0)) {
      return false;
    }
    if (summaryFilter === "not_summarized" && doc.ai_summaries_count > 0) {
      return false;
    }

    return true;
  });
}

test("🔍 ADMIN DOCUMENTS: การค้นหาและกรองเอกสารของผู้ใช้ทั้งหมด", () => {
  const docs = [
    {
      document_id: 1,
      document_name: "สรุปการประชุมประจำปี.pdf",
      user_id: 101,
      users: { first_name: "Somchai", last_name: "Dee", email: "somchai@test.com" },
      ai_summaries_count: 2,
    },
    {
      document_id: 2,
      document_name: "โครงงานวิชาฟิสิกส์.pdf",
      user_id: 102,
      users: { first_name: "Somsak", last_name: "Ying", email: "somsak@test.com" },
      ai_summaries_count: 0,
    },
    {
      document_id: 3,
      document_name: "ใบเสร็จค่าอุปกรณ์.pdf",
      user_id: 101,
      users: { first_name: "Somchai", last_name: "Dee", email: "somchai@test.com" },
      ai_summaries_count: 0,
    },
  ];

  // ค้นหาด้วยชื่อเอกสาร
  const searchDoc = filterAdminDocuments(docs, "ฟิสิกส์", "all", "all");
  assert.equal(searchDoc.length, 1);
  assert.equal(searchDoc[0].document_id, 2);

  // ค้นหาด้วยอีเมลผู้ใช้
  const searchEmail = filterAdminDocuments(docs, "somchai", "all", "all");
  assert.equal(searchEmail.length, 2);

  // กรองตาม User ID
  const filterUser = filterAdminDocuments(docs, "", "102", "all");
  assert.equal(filterUser.length, 1);
  assert.equal(filterUser[0].document_id, 2);

  // กรองเฉพาะที่มีสรุป AI
  const filterSummary = filterAdminDocuments(docs, "", "all", "summarized");
  assert.equal(filterSummary.length, 1);
  assert.equal(filterSummary[0].document_id, 1);

  // กรองเฉพาะที่ยังไม่มีสรุป AI
  const filterNoSummary = filterAdminDocuments(docs, "", "all", "not_summarized");
  assert.equal(filterNoSummary.length, 2);
});

// 3. ทดสอบการคำนวณช่วงเวลา Range ของ Stats
function getDaysCountFromRange(range) {
  switch (range) {
    case "7d": return 7;
    case "14d": return 14;
    case "30d": return 30;
    case "90d": return 90;
    case "all": return 30; // chart sample window
    default: return 7;
  }
}

test("📊 ADMIN STATS: การประมวลผลช่วงเวลา Range สำหรับกราฟ", () => {
  assert.equal(getDaysCountFromRange("7d"), 7);
  assert.equal(getDaysCountFromRange("14d"), 14);
  assert.equal(getDaysCountFromRange("30d"), 30);
  assert.equal(getDaysCountFromRange("90d"), 90);
  assert.equal(getDaysCountFromRange("all"), 30);
});
