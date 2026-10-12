"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { groupDocumentNotes, filterAndSortNotes } from "@/lib/note-grouping";

/**
 * Slide-over Panel แสดงรายการโน้ตทั้งหมดในเอกสาร
 * รองรับ:
 * 1. การจัดกลุ่ม Draw -> Page[n]_Draw[i] (เว้นไม่เกิน 1 นาที)
 * 2. การจัดกลุ่ม Highlight -> Page[n]_highlight[i] (เว้นไม่เกิน 1 นาที)
 * 3. Search: ค้นหาได้เฉพาะข้อความ (Text Note) เท่านั้น
 * 4. Filter: กรองตามประเภท (ทั้งหมด, ข้อความ, วาด, ไฮไลต์) และตามเลขหน้า
 * 5. Sort: เรียงตามเลขหน้า (น้อย->มาก, มาก->น้อย) และเวลา (ใหม่->เก่า, เก่า->ใหม่)
 * 6. Jump to Page: กระโดดไปยังหน้าที่บันทึกโน้ตนั้น
 */
export default function DocumentNotesPanel({
  isOpen,
  onClose,
  documentId,
  documentName,
  onJumpToPage,
  onSelectGroup,
  externalNotes = null,
  onNotesUpdated,
  embedded = false,
}) {
  const [rawNotes, setRawNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all"); // 'all' | 'T' | 'D' | 'H'
  const [filterPage, setFilterPage] = useState("all"); // 'all' | number
  const [sortBy, setSortBy] = useState("page_asc"); // 'page_asc' | 'page_desc' | 'time_desc' | 'time_asc'

  // Delete state
  const [deletingId, setDeletingId] = useState(null);

  // ดึงโน้ตทั้งหมดของเอกสารจาก API
  const fetchNotes = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/notes`, {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      if (res.ok) {
        const notes = data.notes || [];
        setRawNotes(notes);
      } else {
        setError(data.error || "ไม่สามารถโหลดโน้ตได้");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  // รายการโน้ตที่ใช้งาน (ถ้ามี externalNotes ให้ใช้ externalNotes มิเช่นนั้นใช้ rawNotes ที่ดึงจาก API)
  const activeNotes = useMemo(() => {
    if (externalNotes && Array.isArray(externalNotes) && externalNotes.length > 0) {
      return externalNotes;
    }
    return rawNotes;
  }, [externalNotes, rawNotes]);

  // ดึงข้อมูลโน้ตจาก API เมื่อเปิดพาเนลและยังไม่มี externalNotes
  useEffect(() => {
    if (isOpen && (!externalNotes || externalNotes.length === 0)) {
      fetchNotes();
    }
  }, [isOpen, externalNotes, fetchNotes]);

  // ประมวลผลการจัดกลุ่มโน้ตตามกฎเวลาไม่เกิน 1 นาที
  const groupedItems = useMemo(() => {
    return groupDocumentNotes(activeNotes);
  }, [activeNotes]);

  // รายการเลขหน้าทั้งหมดที่มีโน้ต เพื่อนำมาทำตัวเลือก Dropdown
  const availablePages = useMemo(() => {
    const pageSet = new Set(activeNotes.map((n) => Number(n.page_number) || 1));
    return Array.from(pageSet).sort((a, b) => a - b);
  }, [activeNotes]);

  // นับจำนวนรายการแต่ละประเภทสำหรับ Badge
  const counts = useMemo(() => {
    let text = 0;
    let draw = 0;
    let highlight = 0;
    for (const item of groupedItems) {
      if (item.type === "T") text++;
      else if (item.type === "D") draw++;
      else if (item.type === "H") highlight++;
    }
    return {
      total: groupedItems.length,
      text,
      draw,
      highlight,
    };
  }, [groupedItems]);

  // กรองและจัดเรียงรายการ
  const displayItems = useMemo(() => {
    return filterAndSortNotes(groupedItems, {
      searchQuery,
      filterType,
      filterPage,
      sortBy,
    });
  }, [groupedItems, searchQuery, filterType, filterPage, sortBy]);

  // ลบโน้ตเดี่ยวหรือลบทั้งกลุ่มของลายเส้น/ไฮไลต์
  async function handleDeleteItem(item, e) {
    e.stopPropagation();
    if (!confirm(`คุณต้องการลบ "${item.title}" ใช่หรือไม่?`)) return;

    setDeletingId(item.id);
    try {
      const deletePromises = (item.noteIds || [item.noteId]).map((nid) =>
        fetch(`/api/documents/${documentId}/notes/${nid}`, { method: "DELETE" })
      );
      await Promise.all(deletePromises);

      // อัปเดต state ในหน้าจอ
      const deletedSet = new Set(item.noteIds || [item.noteId]);
      const remaining = activeNotes.filter((n) => !deletedSet.has(n.note_id));
      setRawNotes(remaining);
      onNotesUpdated?.(remaining);
    } catch (err) {
      console.error("Delete note error:", err);
      alert("เกิดข้อผิดพลาดในการลบโน้ต กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeletingId(null);
    }
  }

  function handleCardClick(item) {
    setSelectedGroupId(item.id);
    if (onSelectGroup) {
      onSelectGroup(item);
    }
    if (onJumpToPage && item.pageNumber) {
      onJumpToPage(item.pageNumber, item);
    }
  }

  function formatTime(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function formatDate(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  if (!isOpen) return null;

  const panelContent = (
    <div className={`relative w-full bg-white h-full flex flex-col ${embedded ? "overflow-hidden" : "max-w-md sm:max-w-lg shadow-2xl z-10 border-l border-gray-200 animate-slide-left"}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-50/60 via-white to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                โน้ตทั้งหมดในเอกสาร
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {counts.total} รายการ
                </span>
              </h2>
              <p className="text-2xs text-gray-500 truncate max-w-[240px]" title={documentName}>
                {documentName || "เอกสารปัจจุบัน"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={fetchNotes}
              disabled={loading}
              title="รีเฟรชโน้ต"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              title="ปิดหน้าต่าง"
              className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Bar (Search only text notes) */}
        <div className="px-5 pt-3.5 pb-2 border-b border-gray-100 bg-white">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเฉพาะข้อความโน้ต (Text Note)..."
              className="w-full pl-9 pr-9 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-gray-50/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                title="ล้างคำค้นหา"
              >
                ✕
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-1.5 px-0.5">
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              ระบบค้นหาเฉพาะโน้ตที่เป็นข้อความ (Text Note) เท่านั้น
            </span>
            {searchQuery && (
              <span className="text-[11px] font-semibold text-indigo-600">
                พบ {displayItems.length} ข้อความ
              </span>
            )}
          </div>
        </div>

        {/* Filter Tabs & Options */}
        <div className="px-5 py-2.5 bg-gray-50/80 border-b border-gray-200/80 space-y-2.5">
          {/* Type Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterType === "all"
                  ? "bg-white text-indigo-700 shadow-2xs border border-gray-200"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              ทั้งหมด ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("T")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterType === "T"
                  ? "bg-white text-indigo-700 shadow-2xs border border-gray-200"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              📝 ข้อความ ({counts.text})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("D")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterType === "D"
                  ? "bg-white text-indigo-700 shadow-2xs border border-gray-200"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              ✏️ วาดเขียน ({counts.draw})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("H")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                filterType === "H"
                  ? "bg-white text-indigo-700 shadow-2xs border border-gray-200"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              🖍️ ไฮไลต์ ({counts.highlight})
            </button>
          </div>

          {/* Page Filter & Sorting Selectors */}
          <div className="flex items-center justify-between gap-2 text-xs">
            {/* Page Filter */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-gray-500 shrink-0 text-2xs font-medium">หน้า:</span>
              <select
                value={filterPage}
                onChange={(e) => setFilterPage(e.target.value)}
                className="w-full text-xs py-1 px-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">ทุกหน้า</option>
                {availablePages.map((pg) => (
                  <option key={pg} value={pg}>
                    หน้าที่ {pg}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-gray-500 shrink-0 text-2xs font-medium">เรียง:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full text-xs py-1 px-2 border border-gray-200 rounded-lg bg-white text-gray-700 focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="page_asc">เลขหน้า (น้อย → มาก)</option>
                <option value="page_desc">เลขหน้า (มาก → น้อย)</option>
                <option value="time_desc">เวลา (ใหม่ล่าสุด)</option>
                <option value="time_asc">เวลา (เก่าที่สุด)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Note Cards List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && rawNotes.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">กำลังโหลดโน้ตของเอกสาร...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center text-red-600 text-xs">
              <p className="font-semibold mb-1">เกิดข้อผิดพลาด</p>
              <p>{error}</p>
              <button
                onClick={fetchNotes}
                className="mt-2 text-indigo-600 hover:underline font-medium cursor-pointer"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          ) : displayItems.length === 0 ? (
            <div className="py-16 text-center text-gray-400 px-4">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              {searchQuery ? (
                <>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    ไม่พบโน้ตข้อความที่ตรงกับ &quot;{searchQuery}&quot;
                  </p>
                  <p className="text-2xs text-gray-400">
                    การค้นหารองรับเฉพาะ Text Note เท่านั้น ลองค้นหาด้วยคำอื่น หรือกดล้างคำค้นหา
                  </p>
                  <button
                    onClick={() => setSearchQuery("")}
                    className="mt-3 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors cursor-pointer"
                  >
                    ล้างคำค้นหา
                  </button>
                </>
              ) : filterType !== "all" || filterPage !== "all" ? (
                <>
                  <p className="text-xs font-medium text-gray-600 mb-1">
                    ไม่พบโน้ตในเงื่อนไขการกรองนี้
                  </p>
                  <button
                    onClick={() => {
                      setFilterType("all");
                      setFilterPage("all");
                    }}
                    className="mt-2 text-xs text-indigo-600 hover:underline cursor-pointer"
                  >
                    แสดงโน้ตทั้งหมด
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    ยังไม่มีการจดบันทึกในเอกสารนี้
                  </p>
                  <p className="text-2xs text-gray-400">
                    คุณสามารถใช้เครื่องมือวาดเขียน ไฮไลต์ หรือพิมพ์ข้อความบนหน้าเอกสาร PDF ได้เลย
                  </p>
                </>
              )}
            </div>
          ) : (
            displayItems.map((item) => {
              const isDeleting = deletingId === item.id;
              const isText = item.type === "T";
              const isDraw = item.type === "D";
              const isHighlight = item.type === "H";
              const isSelected = selectedGroupId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => handleCardClick(item)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative group ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500"
                      : "border-gray-200 hover:border-indigo-300 hover:shadow-xs bg-white"
                  } ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                >
                  {/* Top Bar: Type Badge, Page Badge, Color Dot & Action */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Type Badge */}
                      {isText && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          📝 ข้อความ
                        </span>
                      )}
                      {isDraw && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          ✏️ ลายเส้น
                        </span>
                      )}
                      {isHighlight && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                          🖍️ ไฮไลต์
                        </span>
                      )}

                      {/* Page Badge */}
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700">
                        หน้า {item.pageNumber}
                      </span>

                      {/* Color indicator */}
                      {item.color && (
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0 shadow-2xs"
                          style={{ backgroundColor: item.color }}
                          title={`สี: ${item.color}`}
                        />
                      )}
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteItem(item, e)}
                      title="ลบโน้ตนี้"
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Body Content */}
                  {isText ? (
                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-gray-800 font-medium whitespace-pre-wrap line-clamp-3 mb-2">
                      &ldquo;{item.text}&rdquo;
                    </div>
                  ) : (
                    <div className="mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900 tracking-tight font-mono">
                          {item.title}
                        </span>
                        <span className="text-[11px] text-gray-500 font-normal">
                          ({isDraw ? `${item.notes.length} ลายเส้น` : `${item.notes.length} ไฮไลต์`})
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {isDraw
                          ? `การจดบันทึกแบบลายเส้นหน้าที่ ${item.pageNumber} กลุ่มที่ ${item.groupIndex}`
                          : `การไฮไลต์เนื้อหาหน้าที่ ${item.pageNumber} กลุ่มที่ ${item.groupIndex}`}
                      </p>
                    </div>
                  )}

                  {/* Footer Meta & Jump CTA */}
                  <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 text-[11px] text-gray-400">
                    <span title={item.firstCreatedAt}>
                      {formatDate(item.firstCreatedAt)} {formatTime(item.firstCreatedAt)} น.
                    </span>

                    <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold group-hover:underline">
                      ไปที่หน้านี้
                      <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
  );

  if (embedded) {
    return panelContent;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-fade-in">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-2xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {panelContent}
    </div>
  );
}
