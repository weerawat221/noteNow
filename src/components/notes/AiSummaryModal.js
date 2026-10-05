"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export default function AiSummaryModal({ isOpen, onClose, documentId, documentName }) {
  const [mounted, setMounted] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingExisting, setFetchingExisting] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock background scrolling and handle escape key when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const originalMainOverflow = mainEl?.style.overflow;

    document.body.style.overflow = "hidden";
    if (mainEl) {
      mainEl.style.overflow = "hidden";
    }

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      if (mainEl) {
        mainEl.style.overflow = originalMainOverflow || "";
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && documentId) {
      loadExistingSummary();
    }
  }, [isOpen, documentId]);

  async function loadExistingSummary() {
    setFetchingExisting(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/summary`);
      const data = await res.json();
      if (res.ok && data.summary) {
        setSummary(data.summary);
      } else {
        setSummary(null);
      }
    } catch {
      // Ignored
    } finally {
      setFetchingExisting(false);
    }
  }

  async function handleGenerateSummary() {
    if (summary) {
      const confirmReRun = confirm(
        "เอกสารนี้เคยสร้างสรุปไว้แล้ว การสร้างใหม่จะใช้โควต้า Gemini API Key ของคุณ คุณต้องการสรุปใหม่อีกครั้งใช่หรือไม่?"
      );
      if (!confirmReRun) return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/documents/${documentId}/summary`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "GEMINI_KEY_INVALID") {
          setError(
            <span>
              Gemini API Key ใช้งานไม่ได้ กรุณาตรวจสอบหรือใส่ Key ใหม่{" "}
              <Link href="/dashboard/settings" className="text-indigo-600 underline font-semibold hover:text-indigo-700">
                ไปที่หน้าตั้งค่าเพื่อจัดการ Key
              </Link>
            </span>
          );
        } else if (data.error === "no_gemini_key") {
          setError(
            <span>
              คุณยังไม่ได้ตั้งค่า Gemini API Key ในระบบ{" "}
              <Link href="/dashboard/settings" className="text-indigo-600 underline font-semibold hover:text-indigo-700">
                ไปที่หน้าตั้งค่าเพื่อเพิ่ม Key
              </Link>
            </span>
          );
        } else {
          setError(data.message || data.error || "เกิดข้อผิดพลาดในการสร้างสรุปเนื้อหา");
        }
        return;
      }

      setSummary(data.summary);
    } catch {
      setError("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                สรุปเนื้อหาเอกสารด้วย AI (Gemini)
              </h2>
              <p className="text-xs text-gray-500 truncate max-w-md">{documentName}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>{error}</div>
            </div>
          )}

          {fetchingExisting ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
              <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">กำลังตรวจสอบสรุปเนื้อหา...</p>
            </div>
          ) : loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-gray-500 gap-3">
              <div className="w-10 h-10 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">กำลังอ่านและวิเคราะห์เอกสารด้วย Gemini AI...</p>
                <p className="text-xs text-gray-400 mt-1">
                  ระบบส่งเนื้อหาทั้งฉบับไปยัง Gemini เพื่อสรุปประเด็นสำคัญ (อาจใช้เวลาประมาณ 5–15 วินาที)
                </p>
              </div>
            </div>
          ) : summary ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-gray-400 pb-2 border-b border-gray-100">
                <span>สรุปเมื่อ: {new Date(summary.created_at).toLocaleString("th-TH")}</span>
                <span className="text-purple-600 font-semibold bg-purple-50 px-2 py-0.5 rounded-full">
                  โมเดล: Gemini 2.0 Flash
                </span>
              </div>

              {/* Render Summary Content */}
              <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed bg-gray-50/60 p-5 rounded-2xl border border-gray-100 whitespace-pre-wrap font-sans text-sm">
                {summary.summary_content}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">ยังไม่มีสรุปเนื้อหาสำหรับเอกสารนี้</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mb-6">
                กดปุ่มด้านล่างเพื่อให้ AI อ่านเอกสาร PDF ทั้งฉบับ และสรุปประเด็นสำคัญ วัตถุประสงค์ และใจความสำคัญให้ทันที
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            * สรุปเนื้อหาทั้งฉบับด้วย Gemini API Key ของคุณเอง
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              ปิด
            </button>
            <button
              onClick={handleGenerateSummary}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  กำลังสรุป...
                </>
              ) : summary ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  สรุปใหม่อีกครั้ง
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  สรุปเนื้อหาด้วย AI
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
