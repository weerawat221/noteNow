"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function LinkDocumentModal({
  isOpen,
  onClose,
  onDocumentLinked,
  existingGoogleFileIds = [],
  defaultFolderId = "",
}) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("browse"); // "browse" | "link"
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(
    defaultFolderId ? String(defaultFolderId) : ""
  );
  const [linkedFileIds, setLinkedFileIds] = useState(
    () => new Set(existingGoogleFileIds || [])
  );

  // Tab Browse State
  const [driveFiles, setDriveFiles] = useState([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [needReauth, setNeedReauth] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState(null);

  // Tab Link State
  const [directLink, setDirectLink] = useState("");
  const [checkingLink, setCheckingLink] = useState(false);
  const [verifiedFile, setVerifiedFile] = useState(null);

  // Submit State
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (existingGoogleFileIds && existingGoogleFileIds.length > 0) {
      setLinkedFileIds((prev) => new Set([...prev, ...existingGoogleFileIds]));
    }
  }, [existingGoogleFileIds]);

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
    if (isOpen) {
      setErrorMsg("");
      setSelectedFolderId(defaultFolderId ? String(defaultFolderId) : "");
      fetchFolders();
      fetchLinkedDocuments();
      if (activeTab === "browse") {
        fetchDriveFiles("");
      }
    }
  }, [isOpen, activeTab, defaultFolderId]);

  async function fetchLinkedDocuments() {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents) {
        const ids = data.documents.map((d) => d.google_file_id).filter(Boolean);
        setLinkedFileIds((prev) => new Set([...prev, ...ids]));
      }
    } catch (err) {
      console.error("Failed to load existing documents:", err);
    }
  }

  async function fetchFolders() {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      if (data.folders) {
        setFolders(data.folders);
      }
    } catch (err) {
      console.error("Failed to load folders:", err);
    }
  }

  async function fetchDriveFiles(search = "") {
    setLoadingDrive(true);
    setNeedReauth(false);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/drive/files?search=${encodeURIComponent(search)}`);
      const data = await res.json();

      if (res.status === 403 && data.error === "need_reauth") {
        setNeedReauth(true);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || "เกิดข้อผิดพลาดในการดึงไฟล์");
        return;
      }

      setDriveFiles(data.files || []);
    } catch {
      setErrorMsg("ไม่สามารถติดต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoadingDrive(false);
    }
  }

  async function handleReauth() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/documents`,
        scopes: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  }

  async function handleCheckLink() {
    if (!directLink.trim()) return;
    setCheckingLink(true);
    setErrorMsg("");
    setVerifiedFile(null);

    try {
      const res = await fetch("/api/drive/check-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkOrId: directLink.trim() }),
      });
      const data = await res.json();

      if (res.status === 403 && data.error === "need_reauth") {
        setNeedReauth(true);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || "ไม่สามารถตรวจสอบลิงก์ได้");
        return;
      }

      setVerifiedFile(data.file);
    } catch {
      setErrorMsg("เกิดข้อผิดพลาดในการตรวจสอบลิงก์");
    } finally {
      setCheckingLink(false);
    }
  }

  async function handleLinkSubmit(file) {
    if (!file) return;
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_name: file.name,
          google_file_id: file.id,
          google_file_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
          file_size: file.size,
          folder_id: selectedFolderId ? parseInt(selectedFolderId, 10) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "ไม่สามารถเชื่อมต่อเอกสารได้");
        setSubmitting(false);
        return;
      }

      // สำเร็จ
      if (file?.id) {
        setLinkedFileIds((prev) => new Set([...prev, file.id]));
      }
      onDocumentLinked?.(data.document);
      onClose();
    } catch {
      setErrorMsg("เกิดข้อผิดพลาดในการเชื่อมต่อเอกสาร");
    } finally {
      setSubmitting(false);
    }
  }

  // จัดเรียง: ไฟล์ที่ยังไม่ได้เพิ่มแสดงก่อน, ไฟล์ที่เพิ่มแล้วทำเป็นสีเทาและแสดงท้ายที่สุด
  const sortedDriveFiles = [...driveFiles].sort((a, b) => {
    const aLinked = linkedFileIds.has(a.id);
    const bLinked = linkedFileIds.has(b.id);
    if (aLinked === bLinked) return 0;
    return aLinked ? 1 : -1;
  });

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">เชื่อมต่อเอกสารจาก Google Drive</h2>
              <p className="text-xs text-gray-500">เลือกไฟล์ PDF หรือวางลิงก์เพื่อนำมาเปิดอ่านและจดบันทึก</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Folder Selection Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-gray-50/70 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
          <span className="text-gray-600 font-medium text-xs whitespace-nowrap">จัดเก็บลงในโฟลเดอร์:</span>
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="">ไม่มีโฟลเดอร์ (หน้าหลัก)</option>
            {folders.map((f) => (
              <option key={f.folder_id} value={f.folder_id}>
                📁 {f.folder_name}
              </option>
            ))}
          </select>
        </div>

        {/* Tab Controls */}
        <div className="px-4 sm:px-6 pt-3 border-b border-gray-100 flex gap-4 sm:gap-6">
          <button
            onClick={() => setActiveTab("browse")}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "browse"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            ค้นหาใน Drive ของฉัน
          </button>
          <button
            onClick={() => setActiveTab("link")}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "link"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            </svg>
            ใส่ลิงก์ Google Drive
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Need Reauth Notice */}
        {needReauth && (
          <div className="mx-6 mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex flex-col gap-2.5">
            <div className="flex items-center gap-2 font-semibold">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              จำเป็นต้องอนุญาตสิทธิ์เข้าถึง Google Drive
            </div>
            <p className="text-xs text-amber-700">
              เนื่องจากความปลอดภัย ระบบต้องขออนุญาตสิทธิ์เข้าถึงไฟล์ PDF จาก Google Drive ของคุณก่อน
            </p>
            <button
              onClick={handleReauth}
              className="self-start px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              </svg>
              อนุญาตสิทธิ์ Google Drive ตอนนี้
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "browse" ? (
            <div>
              {/* Search Bar */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchDriveFiles(searchQuery)}
                    placeholder="พิมพ์ชื่อไฟล์ PDF เพื่อค้นหา..."
                    className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <button
                  onClick={() => fetchDriveFiles(searchQuery)}
                  disabled={loadingDrive}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  ค้นหา
                </button>
              </div>

              {/* Files List */}
              {loadingDrive ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs">กำลังค้นหาไฟล์ PDF ใน Google Drive...</p>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="py-10 text-center text-gray-400">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2 text-gray-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">ไม่พบไฟล์ PDF ใน Google Drive</p>
                  <p className="text-xs text-gray-400 mt-1">อัปโหลดไฟล์ PDF ขึ้น Google Drive หรือลองค้นหาด้วยคำอื่น</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {sortedDriveFiles.map((file) => {
                    const isAlreadyLinked = linkedFileIds.has(file.id);
                    const isSelected = selectedDriveFile?.id === file.id;
                    return (
                      <div
                        key={file.id}
                        onClick={() => {
                          if (!isAlreadyLinked) {
                            setSelectedDriveFile(file);
                          }
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          isAlreadyLinked
                            ? "border-gray-200 bg-gray-100/70 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "border-indigo-600 bg-indigo-50/50 shadow-sm cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/70 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isAlreadyLinked
                                ? "bg-gray-200 text-gray-400"
                                : "bg-red-50 text-red-600"
                            }`}
                          >
                            <span className="text-[10px] font-bold">PDF</span>
                          </div>
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-medium truncate ${
                                isAlreadyLinked ? "text-gray-500 line-through/none" : "text-gray-900"
                              }`}
                            >
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-400 flex items-center gap-2">
                              <span>{formatBytes(file.size)}</span>
                              {file.modifiedTime && (
                                <>
                                  <span>•</span>
                                  <span>แก้ไขล่าสุด: {new Date(file.modifiedTime).toLocaleDateString("th-TH")}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="pl-3 flex items-center">
                          {isAlreadyLinked ? (
                            <span className="text-[11px] font-medium text-gray-500 bg-gray-200/90 px-2 py-0.5 rounded-md whitespace-nowrap">
                              เพิ่มแล้ว
                            </span>
                          ) : (
                            <input
                              type="radio"
                              name="selected_file"
                              checked={isSelected}
                              onChange={() => setSelectedDriveFile(file)}
                              className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Tab: Paste Link */
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  วางลิงก์ Google Drive หรือ File ID:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directLink}
                    onChange={(e) => setDirectLink(e.target.value)}
                    placeholder="https://drive.google.com/file/d/1A2B3C.../view"
                    className="flex-1 px-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <button
                    onClick={handleCheckLink}
                    disabled={checkingLink || !directLink.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {checkingLink ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "ตรวจสอบ"
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  💡 รองรับทุกลิงก์จาก Google Drive (เปิดการแชร์หรือให้สิทธิ์บัญชีที่ใช้งาน)
                </p>
              </div>

              {/* Verified file card */}
              {verifiedFile && (
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between animate-fade-in ${
                    linkedFileIds.has(verifiedFile.id)
                      ? "border-gray-200 bg-gray-100/70 opacity-70"
                      : "border-teal-200 bg-teal-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs ${
                        linkedFileIds.has(verifiedFile.id)
                          ? "bg-gray-200 text-gray-500"
                          : "bg-teal-100 text-teal-700"
                      }`}
                    >
                      PDF
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-semibold truncate ${
                          linkedFileIds.has(verifiedFile.id) ? "text-gray-600" : "text-gray-900"
                        }`}
                      >
                        {verifiedFile.name}
                      </p>
                      <p className="text-xs font-medium mt-0.5 text-gray-500">
                        ขนาด: {formatBytes(verifiedFile.size)}
                        {linkedFileIds.has(verifiedFile.id)
                          ? " • เอกสารนี้ถูกเชื่อมต่อไว้แล้วในระบบ"
                          : " • ตรวจสอบแล้วพร้อมเชื่อมต่อ"}
                      </p>
                    </div>
                  </div>
                  {linkedFileIds.has(verifiedFile.id) ? (
                    <span className="text-gray-500 text-xs font-semibold px-2 py-1 bg-gray-200 rounded-md">
                      เพิ่มแล้ว
                    </span>
                  ) : (
                    <span className="text-teal-600 text-xs font-bold px-2 py-1 bg-white rounded-md border border-teal-200">
                      ✓ ถูกต้อง
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3">
          <p className="text-2xs sm:text-xs text-gray-400 text-center sm:text-left">
            * ไฟล์จะถูกสตรีมเพื่ออ่านและจดบันทึก โดยไม่คัดลอกไฟล์ขึ้นระบบ
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => handleLinkSubmit(activeTab === "browse" ? selectedDriveFile : verifiedFile)}
              disabled={
                submitting ||
                (activeTab === "browse"
                  ? !selectedDriveFile || linkedFileIds.has(selectedDriveFile?.id)
                  : !verifiedFile || linkedFileIds.has(verifiedFile?.id))
              }
              className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  กำลังเชื่อมต่อ...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  เชื่อมต่อเอกสาร
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
