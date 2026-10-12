"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

/**
 * แผงสรุปเนื้อหาเอกสารด้วย AI (Side Panel)
 * 
 * คุณสมบัติ:
 * - Lazy Load: ไม่ดึงข้อมูลหรือ preload อะไรจนกว่าผู้ใช้จะเปิดแผง
 * - SSE Streaming Reader: อ่านและอัปเดตสถานะและเนื้อหา Markdown แบบ real-time
 * - Safe Markdown Rendering: ปิด raw HTML, กำหนด rel="noopener noreferrer" และบล็อกการโหลดภาพภายนอก
 * - ประวัติการสรุป (History Drawer): เปิดดูและลบสรุปเก่าได้
 * - หน้าต่างยืนยันค่าใช้จ่ายพร้อมตัวเลือก "ไม่ต้องแสดงอีก"
 */
export default function AiSummaryPanel({ isOpen, onClose, documentId, documentName }) {
  const [mounted, setMounted] = useState(false);

  // ข้อมูลสรุปและสถานะ
  const [hasKey, setHasKey] = useState(null); // null = ยังไม่ตรวจ, true/false
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [activeSummary, setActiveSummary] = useState(null); // { summary_id, summary_content, created_at }
  const [historyItems, setHistoryItems] = useState([]); // [{ summary_id, created_at }]
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

  // สถานะการสตรีมมิ่ง
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState("");
  const [streamedText, setStreamedText] = useState("");
  const [streamError, setStreamError] = useState(null); // { code, message }
  const abortControllerRef = useRef(null);

  // โมดอลยืนยันก่อนสรุป (Cost Confirmation)
  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [skipCostConfirm, setSkipCostConfirm] = useState(false);

  // โมดอลยืนยันการลบสรุป
  const [summaryToDelete, setSummaryToDelete] = useState(null);
  const [isDeletingSummary, setIsDeletingSummary] = useState(false);

  // คัดลอกข้อความ
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedSkip = localStorage.getItem("notenow_skip_summary_cost_warning");
    if (savedSkip === "true") {
      setSkipCostConfirm(true);
    }
  }, []);

  // เมื่อเปิดแผง: ตรวจสอบ Key และดึงข้อมูลสรุปล่าสุด (Lazy Load)
  useEffect(() => {
    if (!isOpen || !documentId) return;

    // Reset temporary states
    setStreamError(null);
    setCopied(false);
    loadPanelData();

    // ดักจับปุ่ม Escape เพื่อปิดแผง
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !isGenerating) {
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, documentId]);

  async function loadPanelData() {
    setLoadingInitial(true);
    try {
      // 1. ตรวจสอบว่าผู้ใช้มี key หรือไม่
      const keyRes = await fetch("/api/settings/gemini-key", {
        headers: { "Cache-Control": "no-store" },
      });
      const keyData = await keyRes.json();
      const userHasKey = Boolean(keyData.hasKey);
      setHasKey(userHasKey);

      if (!userHasKey) {
        setLoadingInitial(false);
        return;
      }

      // 2. ดึงสรุปเดิม (ถ้ามี)
      const sumRes = await fetch(`/api/documents/${documentId}/summaries`, {
        headers: { "Cache-Control": "no-store" },
      });
      const sumData = await sumRes.json();

      if (sumRes.ok) {
        setActiveSummary(sumData.latest || null);
        setHistoryItems(sumData.items || []);
        setSelectedHistoryId(sumData.latest?.summary_id || null);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingInitial(false);
    }
  }

  // เลือกดูสรุปเก่าจากประวัติ
  async function handleSelectHistory(summaryId) {
    if (summaryId === activeSummary?.summary_id) return;

    try {
      const res = await fetch(`/api/summaries/${summaryId}`, {
        headers: { "Cache-Control": "no-store" },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSummary(data);
        setSelectedHistoryId(data.summary_id);
      }
    } catch {
      // Ignored
    }
  }

  // เริ่มกระบวนการสรุป
  function handleRequestGenerate() {
    if (skipCostConfirm) {
      startSummarization();
    } else {
      setShowCostConfirm(true);
    }
  }

  async function startSummarization() {
    setShowCostConfirm(false);
    setIsGenerating(true);
    setCurrentStep("กำลังเตรียมการเชื่อมต่อ...");
    setStreamedText("");
    setStreamError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/documents/${documentId}/summaries`, {
        method: "POST",
        headers: {
          "Accept": "text/event-stream",
          "Cache-Control": "no-store",
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setStreamError({
          code: errorData.code || "UPSTREAM_UNAVAILABLE",
          message: errorData.error || "เกิดข้อผิดพลาดในการเริ่มประมวลผล",
        });
        setIsGenerating(false);
        return;
      }

      // อ่าน SSE Stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const message of lines) {
          const parts = message.split("\n");
          let event = "message";
          let dataStr = "";

          for (const line of parts) {
            if (line.startsWith("event:")) {
              event = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.replace("data:", "").trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);

            if (event === "status") {
              setCurrentStep(data.message);
            } else if (event === "delta") {
              accumulated += data.text;
              setStreamedText(accumulated);
            } else if (event === "done") {
              const newSummary = {
                summary_id: data.summary_id,
                document_id: documentId,
                summary_content: accumulated,
                created_at: data.created_at,
              };
              setActiveSummary(newSummary);
              setSelectedHistoryId(newSummary.summary_id);
              setHistoryItems((prev) => [
                { summary_id: newSummary.summary_id, created_at: newSummary.created_at },
                ...prev.filter((i) => i.summary_id !== newSummary.summary_id),
              ]);
            } else if (event === "error") {
              setStreamError({
                code: data.code,
                message: data.message,
              });
            }
          } catch {
            // Ignored JSON parse error for partial chunks
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        // ผู้ใช้กดยกเลิก
        setCurrentStep("ยกเลิกการสรุปแล้ว");
      } else {
        setStreamError({
          code: "UPSTREAM_UNAVAILABLE",
          message: "การเชื่อมต่อไปยังเซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่อีกครั้ง",
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancelGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }

  // ลบสรุป
  async function handleDeleteSummary() {
    if (!summaryToDelete) return;
    setIsDeletingSummary(true);

    try {
      const res = await fetch(`/api/summaries/${summaryToDelete.summary_id}`, {
        method: "DELETE",
        headers: { "Cache-Control": "no-store" },
      });

      if (res.ok) {
        const remaining = historyItems.filter((i) => i.summary_id !== summaryToDelete.summary_id);
        setHistoryItems(remaining);

        if (activeSummary?.summary_id === summaryToDelete.summary_id) {
          if (remaining.length > 0) {
            handleSelectHistory(remaining[0].summary_id);
          } else {
            setActiveSummary(null);
            setSelectedHistoryId(null);
          }
        }
        setSummaryToDelete(null);
      }
    } catch {
      // Ignored
    } finally {
      setIsDeletingSummary(false);
    }
  }

  function handleCopy() {
    const textToCopy = isGenerating ? streamedText : activeSummary?.summary_content;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!isOpen || !mounted) return null;

  return (
    <>
      <div className="w-full h-full bg-white flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h2 id="summary-panel-title" className="text-base font-bold text-gray-900 truncate flex items-center gap-2">
                  สรุปเนื้อหาเอกสารด้วย AI
                </h2>
                <p className="text-xs text-gray-500 truncate">{documentName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isGenerating}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 cursor-pointer"
                aria-label="ปิดแผงสรุปเนื้อหา"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Sub-bar: Status or History Selector */}
          {hasKey && !loadingInitial && historyItems.length > 0 && !isGenerating && (
            <div className="px-6 py-2.5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">ประวัติการสรุป ({historyItems.length}):</span>
                <select
                  value={selectedHistoryId || ""}
                  onChange={(e) => handleSelectHistory(Number(e.target.value))}
                  className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 focus:ring-1 focus:ring-purple-500"
                >
                  {historyItems.map((item, index) => (
                    <option key={item.summary_id} value={item.summary_id}>
                      {index === 0 ? "✨ ล่าสุด — " : ""}
                      {new Date(item.created_at).toLocaleString("th-TH", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </option>
                  ))}
                </select>
              </div>

              {activeSummary && (
                <button
                  type="button"
                  onClick={() => setSummaryToDelete(activeSummary)}
                  className="text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  ลบสรุปนี้
                </button>
              )}
            </div>
          )}

          {/* Panel Main Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. Loading Initial State */}
            {loadingInitial && (
              <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
                <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">กำลังตรวจสอบสิทธิ์และข้อมูลสรุป...</p>
              </div>
            )}

            {/* 2. No Gemini Key Configured */}
            {!loadingInitial && hasKey === false && (
              <div className="py-16 text-center max-w-md mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-gray-900">ยังไม่ได้ตั้งค่า Gemini API Key</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  ระบบสรุปเอกสารของ NoteNow ใช้ Gemini API Key ส่วนตัวของคุณเองในการประมวลผล เพื่อความปลอดภัยและคิดค่าใช้จ่ายตามจริงตามโควต้าของ Google AI Studio
                </p>
                <div className="pt-2">
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all"
                  >
                    ไปที่หน้าตั้งค่าเพื่อเพิ่ม Key
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}

            {/* 3. Stream Error Banner */}
            {streamError && (
              <div
                role="alert"
                aria-live="assertive"
                className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-3"
              >
                <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="space-y-1">
                  <p className="font-bold">เกิดข้อผิดพลาดในการสรุปเนื้อหา</p>
                  <p className="leading-relaxed">{streamError.message}</p>
                  {streamError.code === "GEMINI_KEY_INVALID" && (
                    <div className="pt-1">
                      <Link href="/dashboard/settings" className="font-semibold underline text-purple-700">
                        ไปที่หน้าตั้งค่าเพื่อตรวจสอบ Key
                      </Link>
                    </div>
                  )}
                  {streamError.code === "DRIVE_AUTH" && (
                    <div className="pt-1">
                      <Link href="/login" className="font-semibold underline text-purple-700">
                        เข้าสู่ระบบ Google ใหม่อีกครั้ง
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. Currently Generating (Streaming in progress) */}
            {isGenerating && (
              <div className="space-y-4">
                {/* Progress Card */}
                <div
                  role="status"
                  aria-live="polite"
                  className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-purple-900">{currentStep}</p>
                      <p className="text-[11px] text-purple-600">กำลังรับข้อมูลแบบ Streaming จาก Gemini...</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelGeneration}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                </div>

                {/* Live Stream Text Preview */}
                {streamedText && (
                  <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200 prose prose-sm max-w-none text-gray-800 text-xs leading-relaxed animate-fade-in">
                    <SafeMarkdown content={streamedText} />
                  </div>
                )}
              </div>
            )}

            {/* 5. Summary Content Display (When not generating) */}
            {!isGenerating && !loadingInitial && hasKey && activeSummary && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-gray-500 pb-2 border-b border-gray-100">
                  <span>สรุปเมื่อ: {new Date(activeSummary.created_at).toLocaleString("th-TH")}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          คัดลอกแล้ว
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          คัดลอก
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestGenerate}
                      className="px-3 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold border border-purple-200 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      สรุปใหม่
                    </button>
                  </div>
                </div>

                {/* Safe Markdown Display */}
                <div className="p-5 rounded-2xl bg-gray-50/70 border border-gray-200 prose prose-sm max-w-none text-gray-800 text-xs leading-relaxed">
                  <SafeMarkdown content={activeSummary.summary_content} />
                </div>
              </div>
            )}

            {/* 6. Empty State (Key is set, but no summaries yet) */}
            {!isGenerating && !loadingInitial && hasKey && !activeSummary && (
              <div className="py-20 text-center max-w-sm mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">ยังไม่มีบทสรุปสำหรับเอกสารนี้</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    AI จะอ่านเอกสาร PDF ทั้งฉบับจาก Google Drive และวิเคราะห์สาระสำคัญ วัตถุประสงค์ และหัวข้อสำคัญให้โดยอัตโนมัติ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRequestGenerate}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  สรุปทั้งเอกสาร
                </button>
              </div>
            )}
          </div>
      </div>

      {/* Confirmation Modal: Gemini Key Cost Notification */}
      {showCostConfirm &&
        createPortal(
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 p-6 space-y-4">
              <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <div>
                <h3 className="text-base font-bold text-gray-900">ยืนยันการสรุปเนื้อหาเอกสารด้วย AI</h3>
                <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                  ไฟล์ PDF จะถูกส่งต่อไปยังโมเดล Gemini โดยใช้ <strong>API Key ส่วนตัวของคุณ</strong> ซึ่งการประมวลผลจะใช้โควต้าโทเค็นตามแพ็กเกจบัญชี Google AI Studio ของคุณ
                </p>
              </div>

              <div className="pt-1 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="skip-confirm-checkbox"
                  checked={skipCostConfirm}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSkipCostConfirm(checked);
                    if (checked) {
                      localStorage.setItem("notenow_skip_summary_cost_warning", "true");
                    } else {
                      localStorage.removeItem("notenow_skip_summary_cost_warning");
                    }
                  }}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="skip-confirm-checkbox" className="text-xs text-gray-600 cursor-pointer select-none">
                  ไม่ต้องแสดงคำเตือนนี้อีกในครั้งต่อไป
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCostConfirm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={startSummarization}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 transition-colors cursor-pointer"
                >
                  เริ่มสรุปเอกสาร
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Summary Confirmation Modal */}
      {summaryToDelete &&
        createPortal(
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 p-6 space-y-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>

              <div>
                <h3 className="text-base font-bold text-gray-900">ยืนยันการลบสรุปนี้?</h3>
                <p className="text-xs text-gray-500 mt-1">
                  บทสรุปของวันที่ {new Date(summaryToDelete.created_at).toLocaleString("th-TH")} จะถูกลบออกจากระบบอย่างถาวร
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSummaryToDelete(null)}
                  disabled={isDeletingSummary}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSummary}
                  disabled={isDeletingSummary}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isDeletingSummary ? "กำลังลบ..." : "ยืนยันการลบ"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * ปลอดภัยจากการโจมตีด้วย Markdown (No raw HTML, safe links, no blind image load)
 */
function SafeMarkdown({ content }) {
  return (
    <ReactMarkdown
      components={{
        // ห้าม render raw html
        html: () => null,
        // ปรับแต่ง link ให้ปลอดภัย
        a: ({ href, children, ...props }) => {
          const isSafeProtocol = href?.startsWith("http://") || href?.startsWith("https://");
          if (!isSafeProtocol) {
            return <span>{children}</span>;
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:underline"
              {...props}
            >
              {children}
            </a>
          );
        },
        // ป้องกันการแอบโหลดรูปจากภายนอก (SSRF / IP Leak)
        img: ({ alt }) => (
          <span className="inline-block text-gray-400 italic text-[11px] bg-gray-100 px-2 py-0.5 rounded">
            [รูปภาพ: {alt || "ไม่แสดงรูปภาพภายนอกเพื่อความปลอดภัย"}]
          </span>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
