"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function AdminDashboardView() {
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [chartMetric, setChartMetric] = useState("all"); // "all" | "newUsers" | "documents" | "summaries"
  const [hoveredPoint, setHoveredPoint] = useState(null);

  useEffect(() => {
    fetchStats(range);
  }, [range]);

  async function fetchStats(selectedRange) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stats?range=${selectedRange}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "เกิดข้อผิดพลาดในการโหลดสถิติ");
      } else {
        setData(json);
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  }

  const stats = data?.stats;
  const dailyStats = data?.dailyStats || [];
  const topUsers = data?.topUsersByDocuments || [];
  const recentSummaries = data?.recentSummaries || [];

  // คำนวณจุดพิกัด SVG สำหรับกราฟ
  const maxVal = Math.max(
    ...dailyStats.map((d) => Math.max(d.newUsers, d.documents, d.summaries, 1)),
    5
  );

  const chartWidth = 700;
  const chartHeight = 220;
  const paddingX = 40;
  const paddingY = 30;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const getPoints = (key) => {
    if (dailyStats.length === 0) return "";
    return dailyStats
      .map((d, idx) => {
        const x = paddingX + (idx / Math.max(dailyStats.length - 1, 1)) * plotWidth;
        const y = chartHeight - paddingY - (d[key] / maxVal) * plotHeight;
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-fade-in">
      {/* Header & Date Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-100 text-indigo-700 uppercase tracking-wide">
              Admin Portal
            </span>
            <span className="text-xs text-gray-400">ระบบจัดการผู้ดูแลระบบ</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
            รายงานสถิติและภาพรวมระบบ NoteNow
          </h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
            ติดตามการใช้งานระบบ สถิติผู้ใช้งาน เอกสาร Google Drive และการสรุปเนื้อหาด้วย AI
          </p>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs self-start sm:self-auto overflow-x-auto max-w-full scrollbar-none">
          {[
            { id: "7d", label: "7 วัน" },
            { id: "14d", label: "14 วัน" },
            { id: "30d", label: "30 วัน" },
            { id: "90d", label: "90 วัน" },
            { id: "all", label: "ทั้งหมด" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setRange(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                range === item.id
                  ? "bg-indigo-600 text-white shadow-xs font-semibold"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => fetchStats(range)}
            className="text-xs font-semibold underline hover:no-underline"
          >
            ลองใหม่
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Users */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              ผู้ใช้งานทั้งหมด
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900">
              {loading ? "..." : stats?.users?.total || 0}
            </span>
            <span className="text-xs text-gray-500 ml-1.5">คน</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>ใช้งานปกติ: <strong className="text-emerald-600">{stats?.users?.active || 0}</strong></span>
            <span>ถูกระงับ: <strong className="text-rose-600">{stats?.users?.suspended || 0}</strong></span>
          </div>
        </div>

        {/* Card 2: Documents */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              เอกสารที่เชื่อมต่อ
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900">
              {loading ? "..." : stats?.documents?.total || 0}
            </span>
            <span className="text-xs text-gray-500 ml-1.5">ไฟล์</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>พื้นที่รวม: <strong>{formatBytes(stats?.documents?.totalStorageBytes)}</strong></span>
            <span>เฉลี่ย/คน: <strong>{stats?.documents?.averagePerUser || 0}</strong></span>
          </div>
        </div>

        {/* Card 3: AI Summaries */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              สรุปเนื้อหาด้วย AI
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900">
              {loading ? "..." : stats?.summaries?.total || 0}
            </span>
            <span className="text-xs text-gray-500 ml-1.5">ครั้ง</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>เอกสารที่มีสรุป: <strong>{stats?.documents?.summarizedCount || 0} ไฟล์</strong></span>
            <span className="text-purple-600 font-medium">ช่วงนี้: +{stats?.summaries?.inRange || 0}</span>
          </div>
        </div>

        {/* Card 4: Gemini Key Status */}
        <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-2xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              ผู้ใช้มี Gemini Key
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-gray-900">
              {loading ? "..." : stats?.users?.withGeminiKey || 0}
            </span>
            <span className="text-xs text-gray-500 ml-1.5">
              / {stats?.users?.total || 0} คน
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              สัดส่วน:{" "}
              <strong>
                {stats?.users?.total > 0
                  ? Math.round((stats.users.withGeminiKey / stats.users.total) * 100)
                  : 0}
                %
              </strong>
            </span>
            <Link
              href="/dashboard/admin/users"
              className="text-indigo-600 font-semibold hover:underline"
            >
              จัดการคีย์ &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Activity Chart Section */}
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              กราฟกิจกรรมผู้ใช้และการใช้งานรายวัน ({range === "all" ? "ทั้งหมด" : range})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              แสดงแนวโน้มผู้ใช้ใหม่, การเชื่อมโยงไฟล์จาก Google Drive และการสรุปเนื้อหาด้วย AI
            </p>
          </div>

          {/* Metric Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-100 text-xs">
            <button
              onClick={() => setChartMetric("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                chartMetric === "all"
                  ? "bg-white text-gray-900 font-semibold shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              ทั้งหมด
            </button>
            <button
              onClick={() => setChartMetric("newUsers")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                chartMetric === "newUsers"
                  ? "bg-white text-blue-600 font-semibold shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              ผู้ใช้ใหม่
            </button>
            <button
              onClick={() => setChartMetric("documents")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                chartMetric === "documents"
                  ? "bg-white text-indigo-600 font-semibold shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              เอกสาร
            </button>
            <button
              onClick={() => setChartMetric("summaries")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                chartMetric === "summaries"
                  ? "bg-white text-purple-600 font-semibold shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              สรุป AI
            </button>
          </div>
        </div>

        {/* SVG Chart */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[650px] relative">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-64 overflow-visible"
            >
              <defs>
                <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="docGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="sumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = chartHeight - paddingY - ratio * plotHeight;
                const val = Math.round(ratio * maxVal);
                return (
                  <g key={ratio}>
                    <line
                      x1={paddingX}
                      y1={y}
                      x2={chartWidth - paddingX}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingX - 10}
                      y={y + 4}
                      fill="#94a3b8"
                      fontSize="10"
                      textAnchor="end"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Area & Polyline - New Users */}
              {(chartMetric === "all" || chartMetric === "newUsers") && (
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={getPoints("newUsers")}
                />
              )}

              {/* Area & Polyline - Documents */}
              {(chartMetric === "all" || chartMetric === "documents") && (
                <polyline
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={getPoints("documents")}
                />
              )}

              {/* Area & Polyline - Summaries */}
              {(chartMetric === "all" || chartMetric === "summaries") && (
                <polyline
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={getPoints("summaries")}
                />
              )}

              {/* Interactive Data Dots & Hover Hitbox */}
              {dailyStats.map((d, idx) => {
                const x = paddingX + (idx / Math.max(dailyStats.length - 1, 1)) * plotWidth;
                const yUser = chartHeight - paddingY - (d.newUsers / maxVal) * plotHeight;
                const yDoc = chartHeight - paddingY - (d.documents / maxVal) * plotHeight;
                const ySum = chartHeight - paddingY - (d.summaries / maxVal) * plotHeight;

                return (
                  <g
                    key={idx}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredPoint({ ...d, x })}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    {/* Invisible vertical bar for hover hit target */}
                    <rect
                      x={x - 15}
                      y={paddingY}
                      width={30}
                      height={plotHeight}
                      fill="transparent"
                    />

                    {/* Dots */}
                    {(chartMetric === "all" || chartMetric === "newUsers") && (
                      <circle
                        cx={x}
                        cy={yUser}
                        r="3.5"
                        fill="#3b82f6"
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    )}
                    {(chartMetric === "all" || chartMetric === "documents") && (
                      <circle
                        cx={x}
                        cy={yDoc}
                        r="3.5"
                        fill="#6366f1"
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    )}
                    {(chartMetric === "all" || chartMetric === "summaries") && (
                      <circle
                        cx={x}
                        cy={ySum}
                        r="3.5"
                        fill="#a855f7"
                        stroke="#fff"
                        strokeWidth="1.5"
                      />
                    )}

                    {/* X-axis date labels */}
                    {(dailyStats.length <= 14 || idx % Math.ceil(dailyStats.length / 10) === 0) && (
                      <text
                        x={x}
                        y={chartHeight - 8}
                        fill="#64748b"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {d.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Hover Guideline */}
              {hoveredPoint && (
                <line
                  x1={hoveredPoint.x}
                  y1={paddingY}
                  x2={hoveredPoint.x}
                  y2={chartHeight - paddingY}
                  stroke="#cbd5e1"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute z-20 pointer-events-none bg-gray-900/95 backdrop-blur-md text-white text-xs rounded-xl p-3 shadow-2xl border border-white/15 transition-all duration-150"
                style={{
                  left: `${Math.min(Math.max((hoveredPoint.x / chartWidth) * 100, 16), 84)}%`,
                  top: "24px",
                  transform: "translateX(-50%)",
                }}
              >
                <div className="font-bold text-gray-200 border-b border-white/15 pb-1 mb-1.5 flex items-center justify-between gap-4">
                  <span>📅 {hoveredPoint.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">({hoveredPoint.date})</span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4 text-blue-300">
                    <span>ผู้ใช้ใหม่:</span>
                    <strong>{hoveredPoint.newUsers} คน</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-indigo-300">
                    <span>เชื่อมต่อเอกสาร:</span>
                    <strong>{hoveredPoint.documents} ไฟล์</strong>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-purple-300">
                    <span>สรุป AI:</span>
                    <strong>{hoveredPoint.summaries} ครั้ง</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Section: Top Users by Documents & Recent AI Summaries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Top Users by Document Count */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                📁 ผู้ใช้ที่เชื่อมโยงเอกสารสูงสุด (Top 5)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                รายชื่อผู้ใช้ที่นำเข้าไฟล์ PDF จาก Google Drive สูงสุดในระบบ
              </p>
            </div>
            <Link
              href="/dashboard/admin/documents"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              ดูเอกสารทั้งหมด &rarr;
            </Link>
          </div>

          {topUsers.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              ยังไม่มีข้อมูลการเชื่อมต่อเอกสาร
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {topUsers.map((item, idx) => (
                <div
                  key={item.user_id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0
                          ? "bg-amber-100 text-amber-700"
                          : idx === 1
                          ? "bg-gray-200 text-gray-700"
                          : idx === 2
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {item.email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                      {item.count} ไฟล์
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Recent AI Summaries Activity */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                ✨ การสรุปเนื้อหาด้วย AI ล่าสุด
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                ประวัติการเรียกใช้บริการ AI สรุปเอกสารจากผู้ใช้
              </p>
            </div>
            <span className="text-xs text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded-full">
              รวม {stats?.summaries?.total || 0} ครั้ง
            </span>
          </div>

          {recentSummaries.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">
              ยังไม่มีประวัติการสรุปเนื้อหา
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentSummaries.map((s) => (
                <div key={s.summary_id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 truncate">
                      📄 {s.document_name}
                    </p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">
                      โดย: {s.user_name} ({s.user_email})
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                    {new Date(s.created_at).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })} น.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
