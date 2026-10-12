"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import PdfViewerAnnotator from "@/components/notes/PdfViewerAnnotator";
import AiSummaryPanel from "@/components/notes/AiSummaryPanel";
import DocumentNotesPanel from "@/components/notes/DocumentNotesPanel";

export default function DocumentDetailPage({ params }) {
  const unwrappedParams = use(params);
  const documentId = unwrappedParams.id;

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Active panel: null | "notes" | "summary"
  const [activePanel, setActivePanel] = useState(null);
  const [targetPage, setTargetPage] = useState(null);
  const [targetGroup, setTargetGroup] = useState(null);

  // Trigger resize event after panel transition to keep canvas & scroll alignment smooth
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 320);
    return () => clearTimeout(timer);
  }, [activePanel]);

  useEffect(() => {
    async function loadDoc() {
      try {
        const res = await fetch("/api/documents");
        const data = await res.json();
        if (res.ok && data.documents) {
          const found = data.documents.find(
            (d) => String(d.document_id) === String(documentId)
          );
          if (found) {
            setDoc(found);
          } else {
            setError("ไม่พบเอกสารนี้ในระบบ");
          }
        } else {
          setError("เกิดข้อผิดพลาดในการโหลดข้อมูลเอกสาร");
        }
      } catch {
        setError("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
      } finally {
        setLoading(false);
      }
    }

    if (documentId) {
      loadDoc();
    }
  }, [documentId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium">กำลังเตรียมเอกสาร...</p>
        </div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center mt-20 card">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">ไม่สามารถเปิดเอกสารได้</h2>
        <p className="text-xs text-gray-500 mb-4">{error || "ไม่พบเอกสาร"}</p>
        <Link href="/dashboard/documents" className="btn btn-primary inline-flex">
          กลับไปหน้ารวมเอกสาร
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-4 z-30 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/documents"
            className="p-1.5 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1 text-xs font-semibold"
            title="กลับไปหน้ารวมเอกสาร"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">เอกสาร</span>
          </Link>

          <div className="h-4 w-[1px] bg-gray-200" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              PDF
            </span>
            <h1 className="text-sm font-bold text-gray-900 truncate" title={doc.document_name}>
              {doc.document_name}
            </h1>
            {doc.folders && (
              <span className="hidden md:inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600 flex-shrink-0">
                📁 {doc.folders.folder_name}
              </span>
            )}
          </div>
        </div>

        {/* Right Header: Google Drive Link */}
        <div className="flex items-center gap-2 flex-shrink-0">

          <a
            href={doc.google_file_url}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            เปิดใน Google Drive
          </a>
        </div>
      </header>

      {/* Main Annotation Workspace (Split Screen 60% / 40%) */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left: Document View (60% when panel open, 100% when closed) */}
        <section
          className={`h-full overflow-hidden transition-[width,flex] duration-300 ease-in-out ${
            activePanel ? "w-full lg:w-[60%] flex-none" : "w-full flex-1"
          }`}
          aria-label="พื้นที่แสดงเอกสาร PDF และเครื่องมือจดบันทึก"
        >
          <PdfViewerAnnotator
            documentId={documentId}
            activePanel={activePanel}
            onOpenAiSummary={() =>
              setActivePanel((prev) => (prev === "summary" ? null : "summary"))
            }
            onOpenNotesPanel={() =>
              setActivePanel((prev) => (prev === "notes" ? null : "notes"))
            }
            targetPage={targetPage}
            targetGroup={targetGroup}
          />
        </section>

        {/* Right: Side Panel (40% when panel open, 0% when closed) */}
        <aside
          className={`h-full bg-white border-l border-gray-200 overflow-hidden transition-all duration-300 ease-in-out z-20 ${
            activePanel
              ? "w-full lg:w-[40%] flex-none opacity-100 translate-x-0 shadow-xl lg:shadow-none"
              : "w-0 max-w-0 opacity-0 pointer-events-none translate-x-full border-l-0"
          }`}
          aria-label={
            activePanel === "notes"
              ? "แผงแสดงโน้ตทั้งหมด"
              : activePanel === "summary"
              ? "แผงสรุปเนื้อหาด้วย AI"
              : "แผงเครื่องมือด้านข้าง"
          }
        >
          {activePanel === "notes" && (
            <DocumentNotesPanel
              embedded
              isOpen={true}
              onClose={() => setActivePanel(null)}
              documentId={documentId}
              documentName={doc.document_name}
              onJumpToPage={(pageNum) => {
                setTargetPage(pageNum);
              }}
              onSelectGroup={(group) => {
                setTargetGroup(group ? { ...group, _ts: Date.now() } : null);
              }}
            />
          )}

          {activePanel === "summary" && (
            <AiSummaryPanel
              embedded
              isOpen={true}
              onClose={() => setActivePanel(null)}
              documentId={documentId}
              documentName={doc.document_name}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
