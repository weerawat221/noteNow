"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function AdminUsersPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "active" | "suspended" | "has_key" | "no_key"

  // Key Test Modal State
  const [testingKeyUserId, setTestingKeyUserId] = useState(null);
  const [keyTestResult, setKeyTestResult] = useState(null); // { status, message, user }

  // Suspend Confirmation Modal
  const [confirmSuspendUser, setConfirmSuspendUser] = useState(null);
  const [suspending, setSuspending] = useState(false);

  // Success Notification
  const [toast, setToast] = useState(null);

  useEffect(() => {
    checkAdminAndFetchUsers();
  }, []);

  async function checkAdminAndFetchUsers() {
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
      setCurrentUser(authUser);

      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้");
      } else {
        setUsers(data.users || []);
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



  // สลับสถานะระงับ/ยกเลิกระงับ
  async function toggleSuspend(targetUser) {
    const nextState = !targetUser.is_suspended;
    setSuspending(true);
    try {
      const res = await fetch(`/api/admin/users/${targetUser.user_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_suspended: nextState,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || "ไม่สามารถเปลี่ยนสถานะผู้ใช้ได้", "error");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.user_id === targetUser.user_id ? { ...u, is_suspended: nextState } : u))
      );

      setConfirmSuspendUser(null);
      showToast(
        nextState
          ? `ระงับการใช้งาน ${targetUser.email} เรียบร้อยแล้ว`
          : `ปลดระงับการใช้งาน ${targetUser.email} เรียบร้อยแล้ว`
      );
    } catch {
      showToast("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
    } finally {
      setSuspending(false);
    }
  }

  // ทดสอบ Gemini Key ของผู้ใช้
  async function handleTestKey(targetUser) {
    setTestingKeyUserId(targetUser.user_id);
    try {
      const res = await fetch(`/api/admin/users/${targetUser.user_id}/test-key`, {
        method: "POST",
      });
      const json = await res.json();
      setKeyTestResult({
        user: targetUser,
        status: json.status,
        message: json.message,
        has_key: json.has_key,
      });
    } catch {
      setKeyTestResult({
        user: targetUser,
        status: "error",
        message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อทดสอบได้",
        has_key: true,
      });
    } finally {
      setTestingKeyUserId(null);
    }
  }

  // กรองผู้ใช้ตาม Search และ Filter Tab
  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();
    const id = String(u.user_id);

    const matchesSearch = !q || fullName.includes(q) || email.includes(q) || id.includes(q);
    if (!matchesSearch) return false;

    if (filterStatus === "active") return !u.is_suspended;
    if (filterStatus === "suspended") return u.is_suspended;
    if (filterStatus === "has_key") return u.has_gemini_key;
    if (filterStatus === "no_key") return !u.has_gemini_key;

    return true;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
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
          <h1 className="text-2xl font-bold text-gray-900 mt-1 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm">
              👥
            </span>
            จัดการข้อมูลส่วนตัวผู้ใช้และสถานะ Gemini API Key
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            ดูรายชื่อ แก้ไขชื่อ รูปโปรไฟล์ ตรวจสอบ Gemini Key และระงับ/ยกเลิกระงับการเข้าสู่ระบบ
          </p>
        </div>

        {/* Counter Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold">
            ผู้ใช้ทั้งหมด: {users.length} คน
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">
            ถูกระงับ: {users.filter((u) => u.is_suspended).length} คน
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
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
            placeholder="ค้นหาด้วยชื่อ, นามสกุล, อีเมล หรือรหัสผู้ใช้..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none text-xs">
          {[
            { id: "all", label: "ทั้งหมด" },
            { id: "active", label: "ใช้งานปกติ" },
            { id: "suspended", label: "ถูกระงับ" },
            { id: "has_key", label: "มี Gemini Key" },
            { id: "no_key", label: "ไม่มี Key" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                filterStatus === tab.id
                  ? "bg-indigo-600 text-white font-semibold shadow-xs"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            กำลังโหลดข้อมูลผู้ใช้...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-sm">
            {error}
            <div className="mt-2">
              <button
                onClick={checkAdminAndFetchUsers}
                className="text-xs text-indigo-600 underline font-semibold"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            ไม่พบผู้ใช้ตามเงื่อนไขที่ค้นหา
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-200 text-gray-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">ผู้ใช้</th>
                  <th className="py-3 px-4">อีเมล</th>
                  <th className="py-3 px-4">บทบาท</th>
                  <th className="py-3 px-4">Gemini API Key</th>
                  <th className="py-3 px-4">เอกสาร / สรุป</th>
                  <th className="py-3 px-4">สถานะบัญชี</th>
                  <th className="py-3 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((u) => {
                  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "ยังไม่ระบุชื่อ";
                  const isCurrentAdmin = currentUser?.id === u.auth_id;

                  return (
                    <tr
                      key={u.user_id}
                      className={`hover:bg-gray-50/70 transition-colors ${
                        u.is_suspended ? "bg-rose-50/30" : ""
                      }`}
                    >
                      {/* Avatar + Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {u.profile_image ? (
                            <img
                              src={u.profile_image}
                              alt={fullName}
                              className="w-9 h-9 rounded-full object-cover border border-gray-200 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-xs flex-shrink-0">
                              {u.first_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase() || "U"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">
                              {fullName}
                            </p>
                            <span className="text-[11px] text-gray-400">
                              ID: #{u.user_id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4 font-mono text-gray-600 text-[11px]">
                        {u.email}
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4">
                        {u.role === "A" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            🛡️ ADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                            USER
                          </span>
                        )}
                      </td>

                      {/* Gemini Key Status */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {u.has_gemini_key ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              มี Key ในระบบ
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400">
                              ยังไม่มี Key
                            </span>
                          )}

                          {u.has_gemini_key && (
                            <button
                              onClick={() => handleTestKey(u)}
                              disabled={testingKeyUserId === u.user_id}
                              className="px-2 py-0.5 rounded text-[10px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 transition-colors disabled:opacity-50"
                              title="ทดสอบการเชื่อมต่อ API Key กับ Google"
                            >
                              {testingKeyUserId === u.user_id ? "กำลังทดสอบ..." : "ทดสอบ Key"}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Documents / Summaries Count */}
                      <td className="py-3.5 px-4 text-gray-600 text-[11px]">
                        <div>📄 {u.documents_count} เอกสาร</div>
                        <div className="text-gray-400">✨ {u.summaries_count} สรุป</div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {u.is_suspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            🚫 ถูกระงับ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✅ ใช้งานปกติ
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Suspend / Unsuspend toggle button */}
                          {!isCurrentAdmin ? (
                            <button
                              onClick={() => setConfirmSuspendUser(u)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                                u.is_suspended
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100"
                                  : "text-rose-700 bg-rose-50 border-rose-300 hover:bg-rose-100"
                              }`}
                            >
                              {u.is_suspended ? "ปลดระงับ" : "ระงับการใช้งาน"}
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic px-1">
                              (คุณเอง)
                            </span>
                          )}
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
          Modal 2: ยืนยันการระงับ / ปลดระงับผู้ใช้
         ======================================================== */}
      {confirmSuspendUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !suspending && setConfirmSuspendUser(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div
                className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl mb-3 ${
                  confirmSuspendUser.is_suspended ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                }`}
              >
                {confirmSuspendUser.is_suspended ? "✅" : "⚠️"}
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {confirmSuspendUser.is_suspended
                  ? "ยืนยันการปลดระงับผู้ใช้?"
                  : "ยืนยันการระงับการใช้งานผู้ใช้?"}
              </h3>
              <p className="text-xs text-gray-500 mt-2">
                {confirmSuspendUser.is_suspended
                  ? `ผู้ใช้ "${confirmSuspendUser.email}" จะกลับมาเข้าสู่ระบบและใช้งานได้ตามปกติ`
                  : `ผู้ใช้ "${confirmSuspendUser.email}" จะถูกตัดออกจากระบบทันที และจะไม่สามารถเข้าสู่ระบบได้จนกว่าจะได้รับการปลดระงับ`}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                disabled={suspending}
                onClick={() => setConfirmSuspendUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={suspending}
                onClick={() => toggleSuspend(confirmSuspendUser)}
                className={`px-5 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-xs flex items-center gap-2 ${
                  confirmSuspendUser.is_suspended
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {suspending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังดำเนินการ...
                  </>
                ) : confirmSuspendUser.is_suspended ? (
                  "ปลดระงับทันที"
                ) : (
                  "ระงับการใช้งานทันที"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          Modal 3: ผลการทดสอบ Gemini API Key
         ======================================================== */}
      {keyTestResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setKeyTestResult(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div
                className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center text-2xl mb-3 ${
                  keyTestResult.status === "valid"
                    ? "bg-emerald-100 text-emerald-600"
                    : keyTestResult.status === "quota"
                    ? "bg-amber-100 text-amber-600"
                    : "bg-rose-100 text-rose-600"
                }`}
              >
                {keyTestResult.status === "valid"
                  ? "✨"
                  : keyTestResult.status === "quota"
                  ? "⏳"
                  : "❌"}
              </div>
              <h3 className="text-base font-bold text-gray-900">
                ผลการตรวจสอบ Gemini API Key
              </h3>
              <p className="text-xs text-gray-400 font-mono mt-1">
                ผู้ใช้: {keyTestResult.user?.email}
              </p>

              <div
                className={`mt-4 p-3.5 rounded-xl text-xs font-medium border ${
                  keyTestResult.status === "valid"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : keyTestResult.status === "quota"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-rose-50 border-rose-200 text-rose-800"
                }`}
              >
                {keyTestResult.message}
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setKeyTestResult(null)}
                className="px-6 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-xs"
              >
                รับทราบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
