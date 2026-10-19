"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import LinkDocumentModal from "@/components/LinkDocumentModal";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentsPage() {
  const [mounted, setMounted] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");

  // Navigation & Filtering
  const [currentFolderId, setCurrentFolderId] = useState(null); // null = Root
  const [search, setSearch] = useState("");
  const [viewScope, setViewScope] = useState("folder"); // "folder" | "all"

  // Sorting
  const [folderSort, setFolderSort] = useState("name_asc"); // "name_asc" | "name_desc" | "date_desc" | "date_asc" | "files_desc"
  const [fileSort, setFileSort] = useState("date_desc"); // "note_date_desc" | "note_date_asc" | "date_desc" | "date_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc"

  // Moving State (File or Folder)
  const [movingItem, setMovingItem] = useState(null); // { type: "file" | "folder", id: number, name: string, currentFolderId: number | null }
  const [destFolderId, setDestFolderId] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  useEffect(() => {
    if (movingItem) {
      setDestFolderId(movingItem.currentFolderId ?? null);
      setMoveError("");
    }
  }, [movingItem]);

  // Lock background scroll when move modal is open
  useEffect(() => {
    if (!movingItem) return;

    const originalBodyOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const originalMainOverflow = mainEl?.style.overflow;

    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") setMovingItem(null);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      if (mainEl) mainEl.style.overflow = originalMainOverflow || "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [movingItem]);

  useEffect(() => {
    setMounted(true);
    fetchDocuments();
    fetchFolders();
  }, []);

  // Lock background scroll when create folder modal is open
  useEffect(() => {
    if (!isCreateFolderOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const mainEl = document.querySelector("main");
    const originalMainOverflow = mainEl?.style.overflow;

    document.body.style.overflow = "hidden";
    if (mainEl) mainEl.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") setIsCreateFolderOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      if (mainEl) mainEl.style.overflow = originalMainOverflow || "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreateFolderOpen]);

  async function fetchDocuments() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "เกิดข้อผิดพลาดในการโหลดเอกสาร");
      } else {
        setDocuments(data.documents || []);
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  }

  async function fetchFolders() {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      if (data.folders) setFolders(data.folders);
    } catch (err) {
      console.error("Error fetching folders:", err);
    }
  }

  async function handleCreateFolder(e) {
    e?.preventDefault();
    if (!newFolderName.trim()) return;

    setCreatingFolder(true);
    setFolderError("");

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder_name: newFolderName.trim(),
          parent_folder_id: currentFolderId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFolderError(data.error || "ไม่สามารถสร้างโฟลเดอร์ได้");
        return;
      }

      setFolders((prev) => [...prev, data.folder]);
      setNewFolderName("");
      setIsCreateFolderOpen(false);
    } catch {
      setFolderError("เกิดข้อผิดพลาดในการติดต่อเซิร์ฟเวอร์");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleDeleteFolder(folderId, folderName) {
    if (
      !confirm(
        `คุณต้องการลบโฟลเดอร์ "${folderName}" ใช่หรือไม่?\n(เอกสารในโฟลเดอร์จะไม่ถูกลบ โดยจะถูกย้ายออกมาที่หน้าหลัก)`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/folders?id=${folderId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        alert("ไม่สามารถลบโฟลเดอร์ได้");
        return;
      }

      setFolders((prev) => prev.filter((f) => f.folder_id !== folderId));
      setDocuments((prev) =>
        prev.map((d) => (d.folder_id === folderId ? { ...d, folder_id: null } : d))
      );

      if (currentFolderId === folderId) {
        setCurrentFolderId(null);
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการส่งคำขอ");
    }
  }

  async function handleUnlink(docId, docName) {
    if (
      !confirm(
        `คุณต้องการยกเลิกการเชื่อมต่อเอกสาร "${docName}" ใช่หรือไม่?\n(ไฟล์บน Google Drive จะไม่ถูกลบ)`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.document_id !== docId));
      } else {
        alert("ไม่สามารถยกเลิกการเชื่อมต่อได้");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการส่งคำขอ");
    }
  }

  // คำนวณเส้นทาง Breadcrumbs ของโฟลเดอร์
  function getBreadcrumbs(folderId, foldersList) {
    if (!folderId) return [];
    const crumbs = [];
    let curr = foldersList.find((f) => f.folder_id === folderId);
    let guard = 0;
    while (curr && guard < 10) {
      crumbs.unshift(curr);
      if (!curr.parent_folder_id) break;
      curr = foldersList.find((f) => f.folder_id === curr.parent_folder_id);
      guard++;
    }
    return crumbs;
  }

  const breadcrumbs = getBreadcrumbs(currentFolderId, folders);
  const currentFolder = folders.find((f) => f.folder_id === currentFolderId);

  // กรองโฟลเดอร์ที่จะแสดง
  const displayedFolders = folders.filter((f) => {
    if (search.trim()) {
      return f.folder_name.toLowerCase().includes(search.toLowerCase());
    }
    if (currentFolderId === null) {
      return !f.parent_folder_id;
    }
    return f.parent_folder_id === currentFolderId;
  });

  // กรองเอกสารที่จะแสดง
  const displayedDocs = documents.filter((doc) => {
    if (search.trim()) {
      return doc.document_name.toLowerCase().includes(search.toLowerCase());
    }
    if (viewScope === "all") {
      return true;
    }
    if (currentFolderId === null) {
      return !doc.folder_id;
    }
    return doc.folder_id === currentFolderId;
  });

  // เรียงลำดับโฟลเดอร์
  const sortedFolders = [...displayedFolders].sort((a, b) => {
    if (folderSort === "name_asc") {
      return a.folder_name.localeCompare(b.folder_name, "th");
    }
    if (folderSort === "name_desc") {
      return b.folder_name.localeCompare(a.folder_name, "th");
    }
    if (folderSort === "date_desc") {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    if (folderSort === "date_asc") {
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    }
    if (folderSort === "files_desc") {
      const aCount = documents.filter((d) => d.folder_id === a.folder_id).length;
      const bCount = documents.filter((d) => d.folder_id === b.folder_id).length;
      return bCount - aCount;
    }
    return 0;
  });

  // เรียงลำดับไฟล์เอกสาร
  const sortedDocs = [...displayedDocs].sort((a, b) => {
    if (fileSort === "note_date_desc") {
      const aTime = a.latest_note_at ? new Date(a.latest_note_at).getTime() : 0;
      const bTime = b.latest_note_at ? new Date(b.latest_note_at).getTime() : 0;
      if (bTime !== aTime) {
        return bTime - aTime;
      }
      return new Date(b.connected_at || 0) - new Date(a.connected_at || 0);
    }
    if (fileSort === "note_date_asc") {
      const aTime = a.latest_note_at ? new Date(a.latest_note_at).getTime() : Infinity;
      const bTime = b.latest_note_at ? new Date(b.latest_note_at).getTime() : Infinity;
      if (aTime !== bTime) {
        return aTime - bTime;
      }
      return new Date(a.connected_at || 0) - new Date(b.connected_at || 0);
    }
    if (fileSort === "date_desc") {
      return new Date(b.connected_at || 0) - new Date(a.connected_at || 0);
    }
    if (fileSort === "date_asc") {
      return new Date(a.connected_at || 0) - new Date(b.connected_at || 0);
    }
    if (fileSort === "name_asc") {
      return a.document_name.localeCompare(b.document_name, "th");
    }
    if (fileSort === "name_desc") {
      return b.document_name.localeCompare(a.document_name, "th");
    }
    if (fileSort === "size_desc") {
      return (b.file_size || 0) - (a.file_size || 0);
    }
    if (fileSort === "size_asc") {
      return (a.file_size || 0) - (b.file_size || 0);
    }
    return 0;
  });

  const hasAnyFolders = folders.length > 0;
  const rootDocsCount = documents.filter((d) => !d.folder_id).length;

  // ตรวจสอบว่าเป็นโฟลเดอร์ย่อยหรือไม่ (เพื่อป้องกัน circular reference)
  function isFolderSubfolder(checkId, ancestorId) {
    if (checkId === ancestorId) return true;
    let curr = folders.find((f) => f.folder_id === checkId);
    let guard = 0;
    while (curr && guard < 10) {
      if (curr.parent_folder_id === ancestorId) return true;
      if (!curr.parent_folder_id) break;
      curr = folders.find((f) => f.folder_id === curr.parent_folder_id);
      guard++;
    }
    return false;
  }

  // โฟลเดอร์ที่สามารถเลือกเป็นปลายทางได้
  const availableFolders = folders.filter((f) => {
    if (movingItem?.type === "folder") {
      return !isFolderSubfolder(f.folder_id, movingItem.id);
    }
    return true;
  });

  // ฟังก์ชันย้ายไฟล์/โฟลเดอร์ (ใช้ได้ทั้ง Modal และ Drag & Drop)
  async function executeMove(type, id, targetFolderId) {
    try {
      if (type === "file") {
        const res = await fetch(`/api/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_id: targetFolderId }),
        });
        const data = await res.json();
        if (res.ok) {
          const targetFolder = folders.find((f) => f.folder_id === targetFolderId);
          setDocuments((prev) =>
            prev.map((d) =>
              d.document_id === id
                ? {
                  ...d,
                  folder_id: targetFolderId,
                  folders: targetFolder
                    ? { folder_id: targetFolder.folder_id, folder_name: targetFolder.folder_name }
                    : null,
                }
                : d
            )
          );
          return true;
        } else {
          alert(data.error || "ไม่สามารถย้ายไฟล์ได้");
          return false;
        }
      } else {
        if (id === targetFolderId) return false;
        if (targetFolderId && isFolderSubfolder(targetFolderId, id)) {
          alert("ไม่สามารถย้ายโฟลเดอร์เข้าไปในโฟลเดอร์ย่อยของตัวเองได้");
          return false;
        }
        const res = await fetch("/api/folders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_id: id, parent_folder_id: targetFolderId }),
        });
        const data = await res.json();
        if (res.ok) {
          setFolders((prev) =>
            prev.map((f) =>
              f.folder_id === id ? { ...f, parent_folder_id: targetFolderId } : f
            )
          );
          return true;
        } else {
          alert(data.error || "ไม่สามารถย้ายโฟลเดอร์ได้");
          return false;
        }
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
      return false;
    }
  }

  async function handleMoveInModal() {
    if (!movingItem) return;
    setIsMoving(true);
    setMoveError("");

    const success = await executeMove(movingItem.type, movingItem.id, destFolderId);
    setIsMoving(false);
    if (success) {
      setMovingItem(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 animate-fade-in max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold">
              PDF
            </span>
            เอกสารที่เชื่อมต่อ
          </h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm">
            จัดการและจดบันทึกลงบนไฟล์ PDF จาก Google Drive ของคุณ
          </p>
        </div>

        {/* Action Buttons: +folder and +file */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* ปุ่ม + โฟลเดอร์ */}
          <button
            onClick={() => {
              setFolderError("");
              setNewFolderName("");
              setIsCreateFolderOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl shadow-xs hover:border-gray-300 transition-all active:scale-95"
            title="สร้างโฟลเดอร์ใหม่"
            id="btn-create-folder"
          >
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-7 1V7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <span>+ โฟลเดอร์</span>
          </button>

          {/* ปุ่ม + ไฟล์ */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs hover:shadow transition-all active:scale-95"
            title="เชื่อมต่อเอกสารจาก Google Drive"
            id="btn-link-document"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6m-7 8h12a2 2 0 002-2V7.414a2 2 0 00-.586-1.414l-4.414-4.414A2 2 0 0013.586 1H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>+ ไฟล์</span>
          </button>
        </div>
      </div>

      {/* Navigation Bar: Breadcrumbs & Search & View Scope */}
      <div className="card p-3.5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        {/* Breadcrumb Path */}
        <nav className="flex items-center gap-1.5 text-xs overflow-x-auto py-1 scrollbar-none">
          {/* Breadcrumb Path with Drop Target */}
          <button
            onClick={() => {
              setCurrentFolderId(null);
              setViewScope("folder");
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverFolderId("root");
            }}
            onDragLeave={() => {
              if (dragOverFolderId === "root") setDragOverFolderId(null);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOverFolderId(null);
              try {
                const data = JSON.parse(e.dataTransfer.getData("application/json"));
                if (data && data.id) {
                  await executeMove(data.type, data.id, null);
                }
              } catch (err) {
                console.error(err);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap ${dragOverFolderId === "root"
                ? "ring-2 ring-indigo-500 bg-indigo-100 text-indigo-700 font-semibold"
                : currentFolderId === null && viewScope === "folder"
                  ? "bg-indigo-50 text-indigo-700 font-semibold"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>หน้าหลัก</span>
          </button>

          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            const isDragOver = dragOverFolderId === crumb.folder_id;
            return (
              <div key={crumb.folder_id} className="flex items-center gap-1.5 whitespace-nowrap">
                <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <button
                  onClick={() => {
                    setCurrentFolderId(crumb.folder_id);
                    setViewScope("folder");
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverFolderId(crumb.folder_id);
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === crumb.folder_id) setDragOverFolderId(null);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOverFolderId(null);
                    try {
                      const data = JSON.parse(e.dataTransfer.getData("application/json"));
                      if (data && data.id) {
                        await executeMove(data.type, data.id, crumb.folder_id);
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all truncate max-w-[160px] ${isDragOver
                      ? "ring-2 ring-indigo-500 bg-indigo-100 text-indigo-700 font-semibold"
                      : isLast
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                    }`}
                  title={crumb.folder_name}
                >
                  <span>📁</span>
                  <span className="truncate">{crumb.folder_name}</span>
                </button>
              </div>
            );
          })}
        </nav>

        {/* Right side: Search & Scope Toggle */}
        <div className="flex items-center gap-2.5 flex-wrap md:flex-nowrap">
          {/* Scope Toggle (Show in root if there are folders) */}
          {hasAnyFolders && currentFolderId === null && !search && (
            <div className="flex bg-gray-100 p-0.5 rounded-xl text-xs">
              <button
                onClick={() => setViewScope("folder")}
                className={`px-2.5 py-1 rounded-lg transition-all ${viewScope === "folder"
                    ? "bg-white font-semibold text-gray-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                โฟลเดอร์นี้ ({rootDocsCount})
              </button>
              <button
                onClick={() => setViewScope("all")}
                className={`px-2.5 py-1 rounded-lg transition-all ${viewScope === "all"
                    ? "bg-white font-semibold text-gray-900 shadow-xs"
                    : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                ไฟล์ทั้งหมด ({documents.length})
              </button>
            </div>
          )}

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <svg
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
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
              placeholder="ค้นหาชื่อเอกสารหรือโฟลเดอร์..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card p-16 text-center text-gray-400">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">กำลังโหลดรายการเอกสาร...</p>
        </div>
      ) : error ? (
        <div className="card p-8 text-center text-red-600 bg-red-50/50 border-red-200">
          <p className="text-sm font-medium">{error}</p>
          <button
            onClick={fetchDocuments}
            className="mt-3 px-4 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            ลองใหม่
          </button>
        </div>
      ) : displayedFolders.length === 0 && displayedDocs.length === 0 ? (
        /* Empty State */
        <div className="card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {search
              ? "ไม่พบเอกสารหรือโฟลเดอร์ที่ค้นหา"
              : currentFolderId !== null
                ? `โฟลเดอร์ "${currentFolder?.folder_name}" ยังว่างเปล่า`
                : "ยังไม่มีเอกสารที่เชื่อมต่อ"}
          </h3>
          <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
            {search
              ? "ลองค้นหาด้วยคำอื่น หรือล้างคำค้นหา"
              : "เริ่มเพิ่มไฟล์ PDF จาก Google Drive หรือสร้างโฟลเดอร์เพื่อจัดระเบียบเอกสาร"}
          </p>
          {!search && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  setFolderError("");
                  setNewFolderName("");
                  setIsCreateFolderOpen(true);
                }}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl shadow-xs transition-all"
              >
                + สร้างโฟลเดอร์
              </button>
              <button
                onClick={() => setIsModalOpen(true)}
                className="btn btn-primary inline-flex items-center gap-2 text-xs"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                เชื่อมต่อเอกสาร
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* ========================================================
              1. ส่วนโฟลเดอร์ (FOLDERS) — แสดงก่อน แบบ 5 cards ต่อแถว
             ======================================================== */}
          {displayedFolders.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <span>โฟลเดอร์</span>
                  <span className="text-gray-400 font-normal">({displayedFolders.length})</span>
                </h2>

                {/* Sort Folders Control */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  <span className="hidden sm:inline text-gray-400 text-xs">เรียงตาม:</span>
                  <select
                    value={folderSort}
                    onChange={(e) => setFolderSort(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer hover:border-gray-300 shadow-2xs transition-all"
                  >
                    <option value="name_asc">ชื่อ (ก - ฮ)</option>
                    <option value="name_desc">ชื่อ (ฮ - ก)</option>
                    <option value="date_desc">สร้างล่าสุด</option>
                    <option value="date_asc">สร้างแรกสุด</option>
                    <option value="files_desc">จำนวนไฟล์มากสุด</option>
                  </select>
                </div>
              </div>

              {/* 5 cards per row on large screen */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                {sortedFolders.map((folder) => {
                  const fileCount = documents.filter((d) => d.folder_id === folder.folder_id).length;
                  const isDragOver = dragOverFolderId === folder.folder_id;
                  return (
                    <div
                      key={folder.folder_id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ type: "folder", id: folder.folder_id, name: folder.folder_name })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverFolderId(folder.folder_id);
                      }}
                      onDragLeave={() => {
                        if (dragOverFolderId === folder.folder_id) setDragOverFolderId(null);
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setDragOverFolderId(null);
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("application/json"));
                          if (data && data.id) {
                            if (data.type === "folder" && data.id === folder.folder_id) return;
                            await executeMove(data.type, data.id, folder.folder_id);
                          }
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      onClick={() => {
                        setCurrentFolderId(folder.folder_id);
                        setViewScope("folder");
                        setSearch("");
                      }}
                      className={`group relative p-3.5 bg-white rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${isDragOver
                          ? "border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50/70 scale-[1.02] shadow-md"
                          : "border-gray-200 hover:border-indigo-300 hover:shadow-md"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                          📁
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* ปุ่มย้ายโฟลเดอร์ */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMovingItem({
                                type: "folder",
                                id: folder.folder_id,
                                name: folder.folder_name,
                                currentFolderId: folder.parent_folder_id,
                              });
                            }}
                            title="ย้ายโฟลเดอร์..."
                            className="p-1 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          </button>
                          {/* ปุ่มลบโฟลเดอร์ */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFolder(folder.folder_id, folder.folder_name);
                            }}
                            title="ลบโฟลเดอร์"
                            className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3
                          className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 transition-colors truncate"
                          title={folder.folder_name}
                        >
                          {folder.folder_name}
                        </h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {fileCount} ไฟล์
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================
              2. ส่วนไฟล์ (FILES) — แสดงถัดมา แบบ LIST
             ======================================================== */}
          {displayedDocs.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <span>ไฟล์เอกสาร</span>
                  <span className="text-gray-400 font-normal">({displayedDocs.length})</span>
                </h2>

                {/* Sort Files Control */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  <span className="hidden sm:inline text-gray-400 text-xs">เรียงตาม:</span>
                  <select
                    value={fileSort}
                    onChange={(e) => setFileSort(e.target.value)}
                    className="bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer hover:border-gray-300 shadow-2xs transition-all"
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

              {/* Files List View */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs divide-y divide-gray-100">
                {sortedDocs.map((doc) => {
                  const hasSummary = doc.ai_summaries && doc.ai_summaries.length > 0;
                  return (
                    <div
                      key={doc.document_id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ type: "file", id: doc.document_id, name: doc.document_name })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="p-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:bg-gray-50/80 transition-colors group cursor-grab active:cursor-grabbing"
                    >
                      {/* Left: PDF Icon + Name + Meta */}
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-[11px] flex-shrink-0 group-hover:scale-105 transition-transform">
                          PDF
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/dashboard/documents/${doc.document_id}`}
                              className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors truncate block"
                              title={doc.document_name}
                            >
                              {doc.document_name}
                            </Link>
                            {hasSummary && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-100 whitespace-nowrap">
                                AI สรุปแล้ว
                              </span>
                            )}
                            {/* แสดงชื่อโฟลเดอร์หากอยู่ในหน้าหลักและดูไฟล์ทั้งหมด */}
                            {currentFolderId === null && doc.folders && (
                              <span
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCurrentFolderId(doc.folders.folder_id);
                                }}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 cursor-pointer transition-colors whitespace-nowrap"
                                title={`เปิดโฟลเดอร์ ${doc.folders.folder_name}`}
                              >
                                📁 {doc.folders.folder_name}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                            <span>{formatBytes(doc.file_size)}</span>
                            <span>•</span>
                            <span>เชื่อมต่อเมื่อ {new Date(doc.connected_at).toLocaleDateString("th-TH")}</span>
                            {doc.latest_note_at && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                                  <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  โน้ตล่าสุด {new Date(doc.latest_note_at).toLocaleDateString("th-TH", {
                                    day: "numeric",
                                    month: "short",
                                    year: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })} น.
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center justify-end sm:justify-start gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <Link
                          href={`/dashboard/documents/${doc.document_id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                          <span className="hidden sm:inline">เปิดจดบันทึก</span>
                        </Link>

                        {/* ปุ่มย้ายไฟล์ */}
                        <button
                          onClick={() => {
                            setMovingItem({
                              type: "file",
                              id: doc.document_id,
                              name: doc.document_name,
                              currentFolderId: doc.folder_id,
                            });
                          }}
                          title="ย้ายไฟล์ไปยังโฟลเดอร์..."
                          className="p-1.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </button>

                        <a
                          href={doc.google_file_url}
                          target="_blank"
                          rel="noreferrer"
                          title="เปิดใน Google Drive"
                          className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>

                        <button
                          onClick={() => handleUnlink(doc.document_id, doc.document_name)}
                          title="ยกเลิกการเชื่อมต่อเอกสาร"
                          className="p-1.5 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          Modal: สร้างโฟลเดอร์ใหม่
         ======================================================== */}
      {isCreateFolderOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateFolderOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg">
                  📁
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">สร้างโฟลเดอร์ใหม่</h3>
                  <p className="text-xs text-gray-500">
                    {currentFolder
                      ? `สร้างไว้ใน: "${currentFolder.folder_name}"`
                      : "สร้างไว้ที่หน้าหลัก"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateFolderOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="p-6">
              {folderError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-600 text-xs">
                  {folderError}
                </div>
              )}

              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  ชื่อโฟลเดอร์:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="เช่น วิชาฟิสิกส์, สรุปการประชุม..."
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateFolderOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creatingFolder ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      กำลังสร้าง...
                    </>
                  ) : (
                    "สร้างโฟลเดอร์"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================
          Modal: ย้ายไฟล์หรือโฟลเดอร์
         ======================================================== */}
      {movingItem && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overscroll-contain"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMovingItem(null);
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-base flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900">
                    ย้าย{movingItem.type === "file" ? "ไฟล์" : "โฟลเดอร์"}
                  </h3>
                  <p className="text-xs text-gray-500 truncate" title={movingItem.name}>
                    &quot;{movingItem.name}&quot;
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMovingItem(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error */}
            {moveError && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 text-red-600 text-xs">
                {moveError}
              </div>
            )}

            {/* Destination List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              <p className="text-xs font-semibold text-gray-700 mb-2">
                เลือกโฟลเดอร์ปลายทาง:
              </p>

              {/* Destination 1: หน้าหลัก (Root) */}
              <div
                onClick={() => setDestFolderId(null)}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${destFolderId === null
                    ? "border-indigo-600 bg-indigo-50/50 shadow-xs"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/80"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">🏠</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">หน้าหลัก</p>
                    <p className="text-[11px] text-gray-400">ไม่มีโฟลเดอร์ (Root)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {movingItem.currentFolderId === null && (
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                      ตำแหน่งเดิม
                    </span>
                  )}
                  <input
                    type="radio"
                    name="dest_folder"
                    checked={destFolderId === null}
                    onChange={() => setDestFolderId(null)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Destination 2..N: Folders */}
              {availableFolders.map((f) => {
                const isCurrent = movingItem.currentFolderId === f.folder_id;
                const isSelected = destFolderId === f.folder_id;
                const count = documents.filter((d) => d.folder_id === f.folder_id).length;

                return (
                  <div
                    key={f.folder_id}
                    onClick={() => setDestFolderId(f.folder_id)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isSelected
                        ? "border-indigo-600 bg-indigo-50/50 shadow-xs"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/80"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg flex-shrink-0">📁</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate" title={f.folder_name}>
                          {f.folder_name}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {count} ไฟล์
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isCurrent && (
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                          ตำแหน่งเดิม
                        </span>
                      )}
                      <input
                        type="radio"
                        name="dest_folder"
                        checked={isSelected}
                        onChange={() => setDestFolderId(f.folder_id)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setMovingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleMoveInModal}
                disabled={isMoving || destFolderId === movingItem.currentFolderId}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isMoving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    กำลังย้าย...
                  </>
                ) : (
                  "ย้ายมาที่นี่"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================
          Modal: เชื่อมต่อเอกสารจาก Google Drive
         ======================================================== */}
      <LinkDocumentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        existingGoogleFileIds={documents.map((d) => d.google_file_id).filter(Boolean)}
        defaultFolderId={currentFolderId || ""}
        onDocumentLinked={(newDoc) => {
          setDocuments((prev) => [newDoc, ...prev]);
        }}
      />
    </div>
  );
}
