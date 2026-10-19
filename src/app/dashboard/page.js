"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AdminDashboardView from "@/components/admin/AdminDashboardView";

/**
 * หน้า Dashboard หลัก
 * - แอดมิน (role = 'A'): แสดง Admin Dashboard รายงานสถิติผู้ใช้ กราฟ เอกสาร และ AI
 * - ผู้ใช้ทั่วไป (role = 'U'): แสดงภาพรวมการใช้งาน เอกสาร โฟลเดอร์ สรุป AI
 */
export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    documents: 0,
    folders: 0,
    summaries: 0,
  });
  const [recentDocs, setRecentDocs] = useState([]);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        setUser(authUser);

        if (!authUser) return;

        // ดึง role ของผู้ใช้
        const { data: userRow } = await supabase
          .from("users")
          .select("role")
          .eq("auth_id", authUser.id)
          .maybeSingle();

        const currentRole = userRow?.role || "U";
        setRole(currentRole);

        // ถ้าเป็นแอดมิน ให้หยุดตรงนี้เพื่อเรนเดอร์ AdminDashboardView ซึ่งจะดึง API สถิติของมันเอง
        if (currentRole === "A") {
          setLoading(false);
          return;
        }

        // Fetch all data in parallel สำหรับ user ธรรมดา
        const [docsRes, foldersRes, geminiRes] = await Promise.all([
          fetch("/api/documents"),
          fetch("/api/folders"),
          fetch("/api/gemini/status"),
        ]);

        const docsData = await docsRes.json();
        const foldersData = await foldersRes.json();
        const geminiData = await geminiRes.json();

        const docs = docsData.documents || [];
        const folders = foldersData.folders || [];

        // Count summaries from docs that have ai_summaries
        const summaryCount = docs.reduce((acc, d) => {
          return acc + (d.ai_summaries?.length || 0);
        }, 0);

        setStats({
          documents: docs.length,
          folders: folders.length,
          summaries: summaryCount,
        });

        // Recent documents: sorted by connected_at desc, take first 15
        const sorted = [...docs].sort(
          (a, b) => new Date(b.connected_at) - new Date(a.connected_at)
        );
        setRecentDocs(sorted.slice(0, 15));

        setHasGeminiKey(geminiData.hasKey === true);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const firstName =
    user?.user_metadata?.first_name ||
    user?.user_metadata?.given_name ||
    user?.user_metadata?.full_name?.split(" ")[0] ||
    "ผู้ใช้";

  // Determine which quick actions to show
  const showLinkDoc = stats.documents === 0;
  const showGeminiKey = !hasGeminiKey;
  const showCreateFolder = stats.folders === 0;
  const showQuickActions = showLinkDoc || showGeminiKey || showCreateFolder;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          {/* Header skeleton */}
          <div>
            <div className="h-8 bg-gray-200 rounded-lg w-48 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-64" />
          </div>

          {/* Stats skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5">
                <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
                <div className="h-7 bg-gray-200 rounded w-12 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-24" />
              </div>
            ))}
          </div>

          {/* Recent docs skeleton */}
          <div className="card p-5 sm:p-6">
            <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-28 bg-gray-50 rounded-xl border border-gray-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === "A") {
    return <AdminDashboardView />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          สวัสดี, {firstName} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-xs sm:text-sm">
          ยินดีต้อนรับกลับสู่ NoteNow
        </p>
      </div>

      {/* Stats Cards — 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-6 sm:mb-8">
        <StatCard
          title="เอกสารทั้งหมด"
          value={stats.documents}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          color="indigo"
        />
        <StatCard
          title="โฟลเดอร์"
          value={stats.folders}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          }
          color="teal"
        />
        <StatCard
          title="สรุป AI"
          value={stats.summaries}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          }
          color="purple"
        />
      </div>

      {/* เริ่มต้นใช้งาน — ซ่อนถ้าทุกอย่างพร้อมแล้ว */}
      {showQuickActions && (
        <div className="card p-6 mb-8 animate-fade-in">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            เริ่มต้นใช้งาน
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {showLinkDoc && (
              <QuickAction
                title="เชื่อมต่อเอกสาร"
                description="เลือก PDF จาก Google Drive ของคุณ"
                href="/dashboard/documents"
                icon={
                  <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              />
            )}
            {showGeminiKey && (
              <QuickAction
                title="ตั้งค่า Gemini Key"
                description="เพิ่ม API Key เพื่อใช้ฟีเจอร์สรุป AI"
                href="/dashboard/settings"
                icon={
                  <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                }
              />
            )}
            {showCreateFolder && (
              <QuickAction
                title="สร้างโฟลเดอร์"
                description="จัดระเบียบเอกสารของคุณ"
                href="/dashboard/documents"
                icon={
                  <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                }
              />
            )}
          </div>
        </div>
      )}

      {/* เอกสารที่เพิ่มล่าสุด — 3 คอลัมน์ × 5 แถว */}
      <div className="card p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            เอกสารที่เพิ่มล่าสุด
          </h2>
          {stats.documents > 0 && (
            <Link
              href="/dashboard/documents"
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
            >
              ดูทั้งหมด
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>

        {recentDocs.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">ยังไม่มีเอกสารที่เชื่อมต่อ</p>
            <Link
              href="/dashboard/documents"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              เชื่อมต่อเอกสารแรกของคุณ
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentDocs.map((doc, idx) => (
              <Link
                key={doc.document_id}
                href={`/dashboard/documents/${doc.document_id}`}
                className="group flex items-start gap-3 p-3.5 rounded-xl border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-sm transition-all duration-200"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-[10px] flex-shrink-0 group-hover:scale-105 transition-transform">
                  PDF
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors truncate">
                    {doc.document_name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] text-gray-400">
                      {formatBytes(doc.file_size)}
                    </span>
                    <span className="text-gray-200">•</span>
                    <span className="text-[11px] text-gray-400">
                      {formatRelativeDate(doc.connected_at)}
                    </span>
                  </div>
                  {doc.ai_summaries?.length > 0 && (
                    <span className="inline-flex items-center mt-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-purple-50 text-purple-600">
                      ✨ สรุป AI แล้ว
                    </span>
                  )}
                </div>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Helper Components ----

function StatCard({ title, value, icon, color }) {
  const colorMap = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
    teal: { bg: "bg-teal-50", text: "text-teal-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-600" },
    purple: { bg: "bg-purple-50", text: "text-purple-600" },
  };

  const c = colorMap[color] || colorMap.indigo;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg ${c.bg} ${c.text} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{title}</p>
    </div>
  );
}

function QuickAction({ title, description, href, icon }) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 p-4 rounded-xl border border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all duration-200 group"
    >
      <div className="w-9 h-9 rounded-lg bg-gray-50 group-hover:bg-white flex items-center justify-center flex-shrink-0 transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
          {title}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </a>
  );
}

// ---- Helper Functions ----

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}
