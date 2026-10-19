"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function AdminDocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter & Sort State
  const [search, setSearch] = useState("");
  const [selectedUserFilter, setSelectedUserFilter] = useState("all"); // "all" | userId
  const [summaryFilter, setSummaryFilter] = useState("all"); // "all" | "summarized" | "not_summarized"
  const [sortOption, setSortOption] = useState("note_date_desc"); // "note_date_desc" | "note_date_asc" | "date_desc" | "date_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc"


  // Delete Document Modal State
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toast State
  const [toast, setToast] = useState(null);

  useEffect(() => {
    fetchDocumentsAndUsers();
  }, []);

  async function fetchDocumentsAndUsers() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        window.location.href = "/login";
        return;
      }

      const [docsRes, usersRes] = await Promise.all([
        fetch("/api/admin/documents"),
        fetch("/api/admin/users"),
      ]);

      const docsJson = await docsRes.json();
      const usersJson = await usersRes.json();

      if (!docsRes.ok) {
        setError(docsJson.error || "ไม่สามารถโหลดรายการเอกสารได้");
      } else {
        setDocuments(docsJson.documents || []);
      }

      if (usersRes.ok && usersJson.users) {
        setUsers(usersJson.users);
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }


  // ลบการเชื่อมต่อเอกสารออกจากระบบ
  async function handleDeleteDocument() {
    if (!deletingDoc) return;
    setDeleting(true);

    try {
      const res = await fetch(`/api/admin/documents/${deletingDoc.document_id}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || "ไม่สามารถลบเอกสารได้", "error");
        return;
      }

      setDocuments((prev) =>
        prev.filter((d) => d.document_id !== deletingDoc.document_id)
      );

      showToast(`ยกเลิกการเชื่อมต่อ "${deletingDoc.document_name}" สำเร็จ`);
      setDeletingDoc(null);
    } catch {
      showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
    } finally {
      setDeleting(false);
    }
  }

  // กรองเอกสาร (Filter)
  const filteredDocs = documents.filter((doc) => {
    // 1. Search Query (ชื่อไฟล์ หรือ ชื่อ/อีเมลของเจ้าของไฟล์)
    const q = search.toLowerCase().trim();
    if (q) {
      const docName = (doc.document_name || "").toLowerCase();
      const ownerName = `${doc.users?.first_name || ""} ${doc.users?.last_name || ""}`.toLowerCase();
      const ownerEmail = (doc.users?.email || "").toLowerCase();
      const matches = docName.includes(q) || ownerName.includes(q) || ownerEmail.includes(q);
      if (!matches) return false;
    }

    // 2. User Filter
    if (selectedUserFilter !== "all") {
      if (String(doc.user_id) !== String(selectedUserFilter)) return false;
    }

    // 3. AI Summary Filter
    if (summaryFilter === "summarized" && (!doc.ai_summaries_count || doc.ai_summaries_count === 0)) {
      return false;
    }
    if (summaryFilter === "not_summarized" && doc.ai_summaries_count > 0) {
      return false;
    }

    return true;
  });

  // จัดเรียงเอกสาร (Sort)
  const sortedDocs = [...filteredDocs].sort((a, b) => {
    if (sortOption === "note_date_desc") {
      const aTime = a.latest_note_at ? new Date(a.latest_note_at).getTime() : 0;
      const bTime = b.latest_note_at ? new Date(b.latest_note_at).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return new Date(b.connected_at || 0) - new Date(a.connected_at || 0);
    }
    if (sortOption === "note_date_asc") {
      const aTime = a.latest_note_at ? new Date(a.latest_note_at).getTime() : Infinity;
      const bTime = b.latest_note_at ? new Date(b.latest_note_at).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      return new Date(a.connected_at || 0) - new Date(b.connected_at || 0);
    }
    if (sortOption === "date_desc") {
      return new Date(b.connected_at || 0) - new Date(a.connected_at || 0);
    }
    if (sortOption === "date_asc") {
      return new Date(a.connected_at || 0) - new Date(b.connected_at || 0);
    }
    if (sortOption === "name_asc") {
      return a.document_name.localeCompare(b.document_name, "th");
    }
    if (sortOption === "name_desc") {
      return b.document_name.localeCompare(a.document_name, "th");
    }
    if (sortOption === "size_desc") {
      return (b.file_size || 0) - (a.file_size || 0);
    }
    if (sortOption === "size_asc") {
      return (a.file_size || 0) - (b.file_size || 0);
    }
    return 0;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2.5 transition-all transform animate-bounce ${
            toast.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-emerald-600 text-white"
          }`}
        >
          <span>{toast.type === "error" ? "❌" : "✅"}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
            >
              &larr; กลับหน้าแดชบอร์ด
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
              📁
            </span>
            จัดการข้อมูลไฟล์เอกสารของผู้ใช้ทั้งหมด
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
            ค้นหา กรอง และจัดเรียงไฟล์เอกสารจาก Google Drive พร้อมความสามารถในการแก้ไขชื่อและยกเลิกการเชื่อมต่อ
          </p>
        </div>

        {/* Counter Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-semibold">
            เอกสารทั้งหมด: {documents.length} ไฟล์
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 text-xs font-semibold">
            มีสรุป AI: {documents.filter((d) => d.ai_summaries_count > 0).length} ไฟล์
          </span>
        </div>
      </div>

      {/* Control Bar: Search + Filter User + Filter AI + Sort */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <svg
            className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อเอกสาร, เจ้าของไฟล์ หรืออีเมล..."
            className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters and Sort Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* User Filter Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>ผู้ใช้:</span>
            <select
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">ทุกคน ({users.length})</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.first_name ? `${u.first_name} (${u.email})` : u.email}
                </option>
              ))}
            </select>
          </div>

          {/* AI Summary Filter */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>สถานะ AI:</span>
            <select
              value={summaryFilter}
              onChange={(e) => setSummaryFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">ทั้งหมด</option>
              <option value="summarized">✨ สรุปแล้ว</option>
              <option value="not_summarized">ยังไม่ได้สรุป</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>เรียงตาม:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-2xs"
            >
              <option value="note_date_desc">โน้ตล่าสุด</option>
              <option value="note_date_asc">โน้ตแรกสุด</option>
              <option value="date_desc">เชื่อมต่อล่าสุด</option>
              <option value="date_asc">เชื่อมต่อแรกสุด</option>
              <option value="name_asc">ชื่อ (ก - ฮ)</option>
              <option value="name_desc">ชื่อ (ฮ - ก)</option>
              <option value="size_desc">ขนาด (ใหญ่ - เล็ก)</option>
              <option value="size_asc">ขนาด (เล็ก - ใหญ่)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            กำลังโหลดรายการเอกสาร...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-sm">
            {error}
            <div className="mt-2">
              <button
                onClick={fetchDocumentsAndUsers}
                className="text-xs text-indigo-600 underline font-semibold"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          </div>
        ) : sortedDocs.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            ไม่พบเอกสารตามเงื่อนไขที่ค้นหาหรือกรอง
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">เอกสาร</th>
                  <th className="py-3 px-4">เจ้าของไฟล์</th>
                  <th className="py-3 px-4">ขนาดไฟล์</th>
                  <th className="py-3 px-4">วันที่เชื่อมต่อ</th>
                  <th className="py-3 px-4">โน้ตล่าสุด</th>
                  <th className="py-3 px-4">สถานะ AI</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedDocs.map((doc) => {
                  const ownerName =
                    [doc.users?.first_name, doc.users?.last_name].filter(Boolean).join(" ") ||
                    doc.users?.email ||
                    "ไม่ระบุ";

                  return (
                    <tr key={doc.document_id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Document Name + PDF Icon */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                            PDF
                          </div>
                          <div className="min-w-0 max-w-xs sm:max-w-sm">
                            <p
                              className="font-semibold text-gray-900 truncate hover:text-indigo-600 transition-colors"
                              title={doc.document_name}
                            >
                              {doc.document_name}
                            </p>
                            <span className="text-[11px] text-gray-400">
                              ID: #{doc.document_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          {doc.users?.profile_image ? (
                            <img
                              src={doc.users.profile_image}
                              alt="owner avatar"
                              className="w-6 h-6 rounded-full object-cover border border-gray-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-[10px] flex-shrink-0">
                              {ownerName[0]?.toUpperCase() || "U"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-gray-900 font-medium truncate max-w-[130px]">
                              {ownerName}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono truncate max-w-[130px]">
                              {doc.users?.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* File Size */}
                      <td className="py-3.5 px-4 text-gray-600 font-mono text-[11px]">
                        {formatBytes(doc.file_size)}
                      </td>

                      {/* Connected At */}
                      <td className="py-3.5 px-4 text-gray-500 text-[11px]">
                        {new Date(doc.connected_at).toLocaleDateString("th-TH", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>

                      {/* Latest Note At */}
                      <td className="py-3.5 px-4 text-[11px]">
                        {doc.latest_note_at ? (
                          <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                            <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {new Date(doc.latest_note_at).toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })} น.
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>

                      {/* AI Summary Status */}
                      <td className="py-3.5 px-4">
                        {doc.ai_summaries_count > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            ✨ มีสรุป ({doc.ai_summaries_count})
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">
                            ยังไม่มี
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">

                          {/* Delete/Unlink Button */}
                          <button
                            onClick={() => setDeletingDoc(doc)}
                            className="px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                            title="ยกเลิกการเชื่อมต่อไฟล์นี้ออกจาก NoteNow"
                          >
                            ลบไฟล์
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>


      {/* ========================================================
          Modal 2: ยืนยันการลบการเชื่อมต่อเอกสาร (Unlink Document Modal)
         ======================================================== */}
      {deletingDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !deleting && setDeletingDoc(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center text-2xl mb-3">
                🗑️
              </div>
              <h3 className="text-base font-bold text-gray-900">
                ยืนยันการลบการเชื่อมต่อเอกสาร?
              </h3>
              <p className="text-xs text-gray-500 mt-2">
                คุณกำลังจะลบการเชื่อมต่อไฟล์{" "}
                <strong className="text-gray-800 font-semibold break-all">
                  "{deletingDoc.document_name}"
                </strong>{" "}
                ของ{" "}
                <span className="text-indigo-600">
                  {deletingDoc.users?.email || "ผู้ใช้"}
                </span>{" "}
                ออกจากระบบ NoteNow
              </p>
              <p className="text-[11px] text-gray-400 mt-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                🔒 ข้อมูลไฟล์ต้นฉบับใน Google Drive ของผู้ใช้จะไม่ถูกลบหรือได้รับผลกระทบใดๆ
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeletingDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteDocument}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-xs flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังลบ...
                  </>
                ) : (
                  "ยืนยันการลบ"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
