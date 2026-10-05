"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// สีที่ให้เลือกสำหรับวาดเขียนและไฮไลต์
const DRAW_COLORS = ["#4f46e5", "#1f2937", "#dc2626", "#16a34a", "#2563eb", "#ea580c"];
const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f472b6", "#fed7aa"];

export default function PdfViewerAnnotator({
  documentId,
  onOpenAiSummary,
  onOpenNotesPanel,
  onNotesUpdated,
  targetPage,
  targetGroup,
}) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tools: 'select' | 'draw' | 'text' | 'highlight'
  const [activeTool, setActiveTool] = useState("select");
  const [currentColor, setCurrentColor] = useState(DRAW_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [selectedObject, setSelectedObject] = useState(null);
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Undo & Redo Stacks
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // Store all notes grouped by page
  const [allNotes, setAllNotes] = useState({});

  // Mutable Refs เพื่อป้องกันปัญหา React Stale Closure ใน Fabric Event Listeners
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const currentColorRef = useRef(currentColor);
  currentColorRef.current = currentColor;

  const strokeWidthRef = useRef(strokeWidth);
  strokeWidthRef.current = strokeWidth;

  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const fabricModuleRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Per-page refs: Map<pageNum, { pdfCanvas, fabricCanvas, fabricInstance, viewportDims, rendered }>
  const pageRefsMap = useRef(new Map());
  // Per-page DOM container refs for IntersectionObserver
  const pageContainerRefs = useRef(new Map());
  // Track which pages have been rendered
  const renderedPagesRef = useRef(new Set());
  // Per-page highlight drawing state
  const highlightStateRef = useRef(new Map());
  // Flag to prevent scroll handler from firing when we programmatically scroll
  const isJumpingRef = useRef(false);

  // 1. โหลด PDF.js และดึงไฟล์ PDF จาก /api/documents/[id]/pdf
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument(`/api/documents/${documentId}/pdf`);
        const pdf = await loadingTask.promise;

        if (!isCancelled) {
          setPdfDoc(pdf);
          setNumPages(pdf.numPages);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error("PDF load error:", err);
        if (!isCancelled) {
          setError("ไม่สามารถโหลดไฟล์ PDF ได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงไฟล์");
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    if (documentId) {
      loadPdf();
    }

    return () => {
      isCancelled = true;
    };
  }, [documentId]);

  // 2. ดึงโน้ตทั้งหมดของเอกสาร (ทุกหน้า)
  const fetchAllNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}/notes`);
      const data = await res.json();
      if (res.ok) {
        const notes = data.notes || [];
        // Group by page_number
        const grouped = {};
        notes.forEach((n) => {
          const pg = n.page_number;
          if (!grouped[pg]) grouped[pg] = [];
          grouped[pg].push(n);
        });
        setAllNotes(grouped);
        onNotesUpdated?.(notes);
        return grouped;
      }
    } catch (err) {
      console.error("Fetch notes error:", err);
    }
    return {};
  }, [documentId, onNotesUpdated]);

  // Fetch notes for a specific page
  const fetchNotesForPage = useCallback(async (pageNum) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/notes?page=${pageNum}`);
      const data = await res.json();
      if (res.ok) {
        const notes = data.notes || [];
        setAllNotes((prev) => ({ ...prev, [pageNum]: notes }));
        return notes;
      }
    } catch (err) {
      console.error("Fetch notes error:", err);
    }
    return [];
  }, [documentId]);

  // Helper ดึงพิกัดจาก Fabric Event
  function getPointer(fCanvas, opt) {
    if (opt.scenePoint) return opt.scenePoint;
    if (opt.pointer) return opt.pointer;
    if (typeof fCanvas.getScenePoint === "function") return fCanvas.getScenePoint(opt.e);
    if (typeof fCanvas.getPointer === "function") return fCanvas.getPointer(opt.e);
    return { x: 0, y: 0 };
  }

  // แปลง Normalized Coordinates (0-1) จาก DB กลับเป็นพิกัดจริงบน Canvas
  function renderNoteOnCanvas(fabric, fCanvas, note, cWidth, cHeight) {
    if (!note || !note.content) return null;

    let obj = null;

    if (note.note_type === "D") {
      const points = note.content.points || [];
      if (points.length < 2) return null;

      const pathData = points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * cWidth} ${p.y * cHeight}`)
        .join(" ");

      obj = new fabric.Path(pathData, {
        stroke: note.color || "#4f46e5",
        strokeWidth: (note.content.width || 3) * (cWidth / 800),
        fill: null,
        strokeLineCap: "round",
        strokeLineJoin: "round",
        selectable: true,
        perPixelTargetFind: true,
      });
      obj.noteId = note.note_id;
      obj.noteType = "D";
      obj.pageNumber = note.page_number;
      fCanvas.add(obj);
    } else if (note.note_type === "T") {
      obj = new fabric.Textbox(note.content.text || "", {
        left: note.position_x * cWidth,
        top: note.position_y * cHeight,
        fontSize: Math.max(14, 16 * (cWidth / 800)),
        fill: note.color || "#1f2937",
        fontFamily: "Inter, Prompt, sans-serif",
        padding: 6,
        cornerColor: "#4f46e5",
        cornerSize: 8,
        transparentCorners: false,
        selectable: true,
      });
      obj.noteId = note.note_id;
      obj.noteType = "T";
      obj.pageNumber = note.page_number;
      fCanvas.add(obj);
    } else if (note.note_type === "H") {
      const rects = note.content.rects || [];
      rects.forEach((r) => {
        obj = new fabric.Rect({
          left: r.x * cWidth,
          top: r.y * cHeight,
          width: r.w * cWidth,
          height: r.h * cHeight,
          fill: note.color || "#fde047",
          opacity: 0.38,
          selectable: true,
        });
        obj.noteId = note.note_id;
        obj.noteType = "H";
        obj.pageNumber = note.page_number;
        fCanvas.add(obj);
      });
    }

    fCanvas.renderAll();
    return obj;
  }

  // Helper บันทึก Action ลงใน Undo Stack
  function pushUndoAction(action) {
    undoStackRef.current.push(action);
    setUndoStack([...undoStackRef.current]);
    redoStackRef.current = [];
    setRedoStack([]);
  }

  // ตั้งค่า Fabric Event Handlers สำหรับแต่ละหน้า
  function setupFabricEvents(fabric, fCanvas, pageNum) {
    // ตรวจจับเมื่อวาดเสร็จ (note_type: 'D')
    fCanvas.on("path:created", async (e) => {
      const path = e.path;
      if (!path) return;

      const pageData = pageRefsMap.current.get(pageNum);
      const cWidth = pageData?.viewportDims?.width || 800;
      const cHeight = pageData?.viewportDims?.height || 1100;

      const points = [];
      if (path.path && Array.isArray(path.path)) {
        path.path.forEach((cmd) => {
          if (cmd && cmd.length >= 3) {
            const x = Math.min(1, Math.max(0, cmd[cmd.length - 2] / cWidth));
            const y = Math.min(1, Math.max(0, cmd[cmd.length - 1] / cHeight));
            points.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
          }
        });
      }

      if (points.length === 1) {
        points.push({
          x: Math.min(1, points[0].x + 0.001),
          y: Math.min(1, points[0].y + 0.001),
        });
      }

      if (points.length < 2) return;

      const minX = Math.min(...points.map((p) => p.x));
      const minY = Math.min(...points.map((p) => p.y));

      setIsSavingNote(true);
      try {
        const res = await fetch(`/api/documents/${documentId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note_type: "D",
            content: {
              points,
              width: Number((strokeWidthRef.current / (cWidth / 800)).toFixed(2)) || 2,
            },
            page_number: pageNum,
            position_x: minX,
            position_y: minY,
            color: currentColorRef.current,
          }),
        });

        const data = await res.json();
        if (data.note) {
          path.noteId = data.note.note_id;
          path.noteType = "D";
          path.pageNumber = pageNum;
          path.set({
            selectable: true,
            perPixelTargetFind: true,
          });

          pushUndoAction({
            type: "add",
            note: data.note,
            fabricObject: path,
            pageNum,
          });

          fetchNotesForPage(pageNum);
        }
      } catch (err) {
        console.error("Save drawing note error:", err);
      } finally {
        setIsSavingNote(false);
      }
    });

    // ตรวจจับการเลือกวัตถุ (รองรับทั้งการคลิกชิ้นเดี่ยว และการลากเมาส์คลุมเลือกหลายชิ้น)
    fCanvas.on("selection:created", (e) => {
      const activeObj = fCanvas.getActiveObject();
      setSelectedObject(activeObj || (e.selected && e.selected.length > 1 ? e.selected : e.selected?.[0]) || null);
    });
    fCanvas.on("selection:updated", (e) => {
      const activeObj = fCanvas.getActiveObject();
      setSelectedObject(activeObj || (e.selected && e.selected.length > 1 ? e.selected : e.selected?.[0]) || null);
    });
    fCanvas.on("selection:cleared", () => {
      setSelectedObject(null);
    });

    // จัดการ Text Tool และ Highlight Tool
    fCanvas.on("mouse:down", (opt) => {
      const currentTool = activeToolRef.current;
      const curColor = currentColorRef.current;
      const pageData = pageRefsMap.current.get(pageNum);
      const cWidth = pageData?.viewportDims?.width || 800;
      const cHeight = pageData?.viewportDims?.height || 1100;
      const pointer = getPointer(fCanvas, opt);

      // โหมด Text ('T')
      if (currentTool === "text" && !opt.target) {
        const normX = Math.min(1, Math.max(0, pointer.x / cWidth));
        const normY = Math.min(1, Math.max(0, pointer.y / cHeight));

        const textbox = new fabric.Textbox("พิมพ์ข้อความที่นี่...", {
          left: pointer.x,
          top: pointer.y,
          fontSize: Math.max(14, 16 * (cWidth / 800)),
          fill: curColor,
          fontFamily: "Inter, Prompt, sans-serif",
          padding: 6,
          cornerColor: "#4f46e5",
          cornerSize: 8,
          transparentCorners: false,
        });

        fCanvas.add(textbox);
        fCanvas.setActiveObject(textbox);
        textbox.enterEditing();
        textbox.selectAll();
        fCanvas.renderAll();

        textbox.on("editing:exited", async () => {
          if (!textbox.text || !textbox.text.trim()) {
            fCanvas.remove(textbox);
            fCanvas.renderAll();
            return;
          }

          setIsSavingNote(true);
          try {
            const res = await fetch(`/api/documents/${documentId}/notes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                note_type: "T",
                content: { text: textbox.text },
                page_number: pageNum,
                position_x: Number(normX.toFixed(4)),
                position_y: Number(normY.toFixed(4)),
                color: curColor,
              }),
            });
            const data = await res.json();
            if (data.note) {
              textbox.noteId = data.note.note_id;
              textbox.noteType = "T";
              textbox.pageNumber = pageNum;

              pushUndoAction({
                type: "add",
                note: data.note,
                fabricObject: textbox,
                pageNum,
              });

              fetchNotesForPage(pageNum);
            }
          } catch (err) {
            console.error("Save text note error:", err);
          } finally {
            setIsSavingNote(false);
          }
        });
      }

      // โหมด Highlight ('H')
      if (currentTool === "highlight") {
        highlightStateRef.current.set(pageNum, {
          isDrawing: true,
          start: { x: pointer.x, y: pointer.y },
          tempRect: null,
        });

        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: curColor,
          opacity: 0.38,
          selectable: false,
        });

        const state = highlightStateRef.current.get(pageNum);
        state.tempRect = rect;
        fCanvas.add(rect);
      }
    });

    fCanvas.on("mouse:move", (opt) => {
      const state = highlightStateRef.current.get(pageNum);
      if (!state?.isDrawing || !state?.tempRect || !state?.start) return;
      const pointer = getPointer(fCanvas, opt);
      const start = state.start;

      const left = Math.min(start.x, pointer.x);
      const top = Math.min(start.y, pointer.y);
      const width = Math.abs(pointer.x - start.x);
      const height = Math.abs(pointer.y - start.y);

      state.tempRect.set({ left, top, width, height });
      fCanvas.renderAll();
    });

    fCanvas.on("mouse:up", async () => {
      const state = highlightStateRef.current.get(pageNum);
      if (!state?.isDrawing || !state?.tempRect) return;

      state.isDrawing = false;
      const rect = state.tempRect;
      state.tempRect = null;

      const pageData = pageRefsMap.current.get(pageNum);
      const cWidth = pageData?.viewportDims?.width || 800;
      const cHeight = pageData?.viewportDims?.height || 1100;

      if (rect.width < 10 || rect.height < 5) {
        fCanvas.remove(rect);
        fCanvas.renderAll();
        return;
      }

      rect.set({ selectable: true });
      fCanvas.renderAll();

      const normX = Math.min(1, Math.max(0, rect.left / cWidth));
      const normY = Math.min(1, Math.max(0, rect.top / cHeight));
      const normW = Math.min(1, Math.max(0, rect.width / cWidth));
      const normH = Math.min(1, Math.max(0, rect.height / cHeight));

      setIsSavingNote(true);
      try {
        const res = await fetch(`/api/documents/${documentId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note_type: "H",
            content: {
              rects: [
                {
                  x: Number(normX.toFixed(4)),
                  y: Number(normY.toFixed(4)),
                  w: Number(normW.toFixed(4)),
                  h: Number(normH.toFixed(4)),
                },
              ],
              text: "Highlight",
            },
            page_number: pageNum,
            position_x: Number(normX.toFixed(4)),
            position_y: Number(normY.toFixed(4)),
            color: currentColorRef.current,
          }),
        });
        const data = await res.json();
        if (data.note) {
          rect.noteId = data.note.note_id;
          rect.noteType = "H";
          rect.pageNumber = pageNum;

          pushUndoAction({
            type: "add",
            note: data.note,
            fabricObject: rect,
            pageNum,
          });

          fetchNotesForPage(pageNum);
        }
      } catch (err) {
        console.error("Save highlight error:", err);
      } finally {
        setIsSavingNote(false);
      }
    });

    // เมื่อเคลื่อนย้ายหรือปรับตำแหน่งโน้ต
    fCanvas.on("object:modified", async (e) => {
      const obj = e.target;
      if (!obj || !obj.noteId) return;

      const pageData = pageRefsMap.current.get(pageNum);
      const cWidth = pageData?.viewportDims?.width || 800;
      const cHeight = pageData?.viewportDims?.height || 1100;

      const normX = Math.min(1, Math.max(0, obj.left / cWidth));
      const normY = Math.min(1, Math.max(0, obj.top / cHeight));

      try {
        await fetch(`/api/documents/${documentId}/notes/${obj.noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position_x: Number(normX.toFixed(4)),
            position_y: Number(normY.toFixed(4)),
          }),
        });
      } catch (err) {
        console.error("Update note position error:", err);
      }
    });
  }

  // Render a single page (PDF + Fabric overlay + notes)
  const renderSinglePage = useCallback(async (pageNum) => {
    if (!pdfDoc) return;
    if (renderedPagesRef.current.has(pageNum)) return;
    renderedPagesRef.current.add(pageNum);

    const containerEl = pageContainerRefs.current.get(pageNum);
    if (!containerEl) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      // Create PDF canvas
      const pdfCanvas = document.createElement("canvas");
      pdfCanvas.width = viewport.width;
      pdfCanvas.height = viewport.height;
      pdfCanvas.className = "block";
      const ctx = pdfCanvas.getContext("2d");

      // Create Fabric canvas element
      const fabricCanvasEl = document.createElement("canvas");
      fabricCanvasEl.width = viewport.width;
      fabricCanvasEl.height = viewport.height;

      // Build DOM
      const wrapper = document.createElement("div");
      wrapper.className = "relative";
      wrapper.appendChild(pdfCanvas);

      const fabricOverlay = document.createElement("div");
      fabricOverlay.className = "absolute inset-0 z-10 pointer-events-auto";
      fabricOverlay.appendChild(fabricCanvasEl);
      wrapper.appendChild(fabricOverlay);

      // Clear existing content and add
      const existingWrapper = containerEl.querySelector(".page-render-wrapper");
      if (existingWrapper) existingWrapper.remove();
      wrapper.classList.add("page-render-wrapper");
      containerEl.appendChild(wrapper);

      // Render PDF
      const renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;

      // Load & setup Fabric.js
      const fabric = await import("fabric");
      fabricModuleRef.current = fabric;

      const fCanvas = new fabric.Canvas(fabricCanvasEl, {
        width: viewport.width,
        height: viewport.height,
        selection: activeToolRef.current === "select",
        isDrawingMode: activeToolRef.current === "draw",
        selectionColor: "rgba(99, 102, 241, 0.15)",
        selectionBorderColor: "#4f46e5",
        selectionLineWidth: 1.5,
        selectionFullyContained: false,
      });

      fCanvas.freeDrawingBrush = new fabric.PencilBrush(fCanvas);
      fCanvas.freeDrawingBrush.color = currentColorRef.current;
      fCanvas.freeDrawingBrush.width = strokeWidthRef.current;

      if (activeToolRef.current === "draw") {
        fCanvas.defaultCursor = "crosshair";
      } else if (activeToolRef.current === "text") {
        fCanvas.defaultCursor = "text";
      } else if (activeToolRef.current === "highlight") {
        fCanvas.defaultCursor = "crosshair";
      } else {
        fCanvas.defaultCursor = "default";
      }

      // Store refs
      pageRefsMap.current.set(pageNum, {
        pdfCanvas,
        fabricCanvasEl,
        fabricInstance: fCanvas,
        viewportDims: { width: viewport.width, height: viewport.height },
      });

      // Setup events for this page
      setupFabricEvents(fabric, fCanvas, pageNum);

      // Fetch and render notes for this page
      const notes = await fetchNotesForPage(pageNum);
      (notes || []).forEach((note) => {
        renderNoteOnCanvas(fabric, fCanvas, note, viewport.width, viewport.height);
      });

    } catch (err) {
      if (err?.name !== "RenderingCancelledException") {
        console.error(`Page ${pageNum} render error:`, err);
      }
    }
  }, [pdfDoc, scale, documentId, fetchNotesForPage]);

  // 3. Setup IntersectionObserver for lazy page rendering
  useEffect(() => {
    if (!pdfDoc || numPages === 0) return;

    // Reset rendered pages when scale changes
    renderedPagesRef.current.clear();
    // Cleanup old fabric instances
    pageRefsMap.current.forEach((data) => {
      if (data.fabricInstance) {
        data.fabricInstance.dispose();
      }
    });
    pageRefsMap.current.clear();

    // Clear page container content
    pageContainerRefs.current.forEach((el) => {
      const wrapper = el.querySelector(".page-render-wrapper");
      if (wrapper) wrapper.remove();
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.dataset.pageNum, 10);
            if (pageNum && !renderedPagesRef.current.has(pageNum)) {
              renderSinglePage(pageNum);
            }
          }
        });
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px 0px",
        threshold: 0.01,
      }
    );

    pageContainerRefs.current.forEach((el) => {
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [pdfDoc, numPages, scale, renderSinglePage]);

  // Track current page via scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || numPages === 0) return;

    let ticking = false;

    function handleScroll() {
      if (isJumpingRef.current) return;
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.top + containerRect.height / 3;

        let closestPage = 1;
        let closestDistance = Infinity;

        pageContainerRefs.current.forEach((el, pageNum) => {
          const rect = el.getBoundingClientRect();
          const pageCenter = rect.top + rect.height / 2;
          const distance = Math.abs(pageCenter - containerCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPage = pageNum;
          }
        });

        setCurrentPage(closestPage);
        ticking = false;
      });
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [numPages]);

  // Jump to page
  function jumpToPage(pageNum) {
    const el = pageContainerRefs.current.get(pageNum);
    if (!el || !scrollContainerRef.current) return;
    isJumpingRef.current = true;
    setCurrentPage(pageNum);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => {
      isJumpingRef.current = false;
    }, 600);
  }

  // เลื่อนหน้าจอให้วัตถุหรือกลุ่มที่เลือกอยู่ตรงกลางมุมมอง (Scroll & center directly to group)
  function scrollToGroupBounds(pageNum, targetObj) {
    const container = scrollContainerRef.current;
    const pageData = pageRefsMap.current.get(pageNum);
    if (!container || !pageData || !targetObj) return;

    const canvasEl = pageData.fabricCanvasEl;
    if (!canvasEl) return;

    // หาพิกัด Bounding Box ของวัตถุ/กลุ่มบน Canvas
    const objRect =
      typeof targetObj.getBoundingRect === "function"
        ? targetObj.getBoundingRect()
        : {
            left: targetObj.left || 0,
            top: targetObj.top || 0,
            width: targetObj.width || 0,
            height: targetObj.height || 0,
          };

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvasEl.getBoundingClientRect();

    // คำนวณระยะกึ่งกลางของวัตถุเทียบกับกึ่งกลางของ Scroll Container
    const objCenterY = canvasRect.top + objRect.top + objRect.height / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;
    const deltaY = objCenterY - containerCenterY;

    const objCenterX = canvasRect.left + objRect.left + objRect.width / 2;
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const deltaX = objCenterX - containerCenterX;

    isJumpingRef.current = true;
    setCurrentPage(pageNum);

    container.scrollBy({
      top: deltaY,
      left: deltaX,
      behavior: "smooth",
    });

    setTimeout(() => {
      isJumpingRef.current = false;
    }, 600);
  }

  // ตอบสนองเมื่อมีการคลิกโน้ตจาก Notes Panel เพื่อกระโดดไปยังหน้านั้น
  useEffect(() => {
    if (targetPage && targetPage >= 1 && targetPage <= numPages) {
      jumpToPage(targetPage);
    }
  }, [targetPage, numPages]);

  // ตอบสนองเมื่อคลิกกลุ่มโน้ตจาก Notes Panel:
  // 1. Unselect โน้ตอื่นๆ ทั้งหมดก่อน
  // 2. สลับเครื่องมือเป็น select tool เพื่อให้แสดงกรอบและเลือกเส้นได้ทันที
  // 3. เลื่อนหน้าจอไปยังตำแหน่งของกลุ่มนั้นโดยตรง (Scroll to group)
  // 4. เลือกทุกเส้น (Draw) หรือไฮไลต์ (Highlight) หรือ Text ทั้งหมดที่อยู่ในกลุ่มนั้น
  useEffect(() => {
    if (!targetGroup || !targetGroup.pageNumber) return;

    const pageNum = Number(targetGroup.pageNumber);
    const targetIds = new Set(
      (targetGroup.noteIds || [targetGroup.noteId] || []).map(Number).filter((id) => !isNaN(id))
    );

    // 1. Unselect โน้ตอื่นๆ บนทุกหน้าก่อน
    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (fCanvas) {
        fCanvas.discardActiveObject();
        fCanvas.requestRenderAll();
      }
    });
    setSelectedObject(null);

    // 2. ปรับ tool เป็น 'select'
    setActiveTool("select");
    activeToolRef.current = "select";
    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (fCanvas) {
        fCanvas.isDrawingMode = false;
        fCanvas.selection = true;
        fCanvas.defaultCursor = "default";
      }
    });

    // 3. เลื่อนหน้าจอไปยังหน้านั้นก่อน
    jumpToPage(pageNum);

    // 4. ฟังก์ชันค้นหาและเลือกวัตถุทั้งหมดในกลุ่ม พร้อมเลื่อนหน้าจอไปยังตำแหน่งกลุ่มโดยตรง
    async function selectGroupObjects() {
      // หากหน้านี้ยังไม่ถูก render ให้ทำการ render ก่อน
      if (!renderedPagesRef.current.has(pageNum)) {
        await renderSinglePage(pageNum);
      }

      const applySelection = async () => {
        const pageData = pageRefsMap.current.get(pageNum);
        const fCanvas = pageData?.fabricInstance;
        if (!fCanvas) return false;

        const allCanvasObjects = fCanvas.getObjects();
        const matchingObjects = allCanvasObjects.filter(
          (obj) => obj && obj.noteId && targetIds.has(Number(obj.noteId))
        );

        if (matchingObjects.length === 0) return false;

        // ยกเลิก active object เดิมบน canvas หน้านี้
        fCanvas.discardActiveObject();

        let activeTarget = null;
        if (matchingObjects.length === 1) {
          fCanvas.setActiveObject(matchingObjects[0]);
          setSelectedObject(matchingObjects[0]);
          activeTarget = matchingObjects[0];
        } else {
          const fabric = fabricModuleRef.current || (await import("fabric"));
          const activeSelection = new fabric.ActiveSelection(matchingObjects, {
            canvas: fCanvas,
          });
          fCanvas.setActiveObject(activeSelection);
          setSelectedObject(activeSelection);
          activeTarget = activeSelection;
        }

        fCanvas.requestRenderAll();

        // เลื่อนหน้าจอไปยังตำแหน่งของกลุ่มนั้นโดยตรง
        scrollToGroupBounds(pageNum, activeTarget);
        setTimeout(() => {
          scrollToGroupBounds(pageNum, activeTarget);
        }, 300);

        return true;
      };

      const selected = await applySelection();
      if (!selected) {
        // หากวัตถุยังกำลังโหลดจาก DB ให้ลองซ้ำหลังจาก render เสร็จ
        setTimeout(async () => {
          const retryOk = await applySelection();
          if (!retryOk) {
            setTimeout(applySelection, 350);
          }
        }, 200);
      }
    }

    selectGroupObjects();
  }, [targetGroup, renderSinglePage]);

  // อัปเดตการทำงานของ Tool บนทุกหน้าที่ render แล้ว
  function handleSelectTool(tool) {
    setActiveTool(tool);
    activeToolRef.current = tool;

    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (!fCanvas) return;

      if (tool === "draw") {
        fCanvas.isDrawingMode = true;
        fCanvas.selection = false;

        if (!fCanvas.freeDrawingBrush && fabricModuleRef.current) {
          fCanvas.freeDrawingBrush = new fabricModuleRef.current.PencilBrush(fCanvas);
        }
        if (fCanvas.freeDrawingBrush) {
          fCanvas.freeDrawingBrush.color = currentColorRef.current;
          fCanvas.freeDrawingBrush.width = strokeWidthRef.current;
        }
        fCanvas.defaultCursor = "crosshair";
      } else {
        fCanvas.isDrawingMode = false;
        fCanvas.selection = tool === "select";

        if (tool === "text") {
          fCanvas.defaultCursor = "text";
        } else if (tool === "highlight") {
          fCanvas.defaultCursor = "crosshair";
        } else {
          fCanvas.defaultCursor = "default";
        }
      }

      fCanvas.requestRenderAll();
    });

    if (tool === "highlight" && !HIGHLIGHT_COLORS.includes(currentColor)) {
      handleChangeColor(HIGHLIGHT_COLORS[0]);
    } else if (tool === "draw" && !DRAW_COLORS.includes(currentColor)) {
      handleChangeColor(DRAW_COLORS[0]);
    }
  }

  // เปลี่ยนสีโน้ต (หากมีการเลือกโน้ตอยู่ ไม่ว่าจะเป็นชิ้นเดียวหรือหลายชิ้นในกลุ่ม จะเปลี่ยนสีทุกอันพร้อมกันและบันทึกลง DB ทันที)
  async function handleChangeColor(color) {
    setCurrentColor(color);
    currentColorRef.current = color;

    // 1. อัปเดตสีของ Brush สำหรับโหมดวาด
    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (fCanvas?.freeDrawingBrush) {
        fCanvas.freeDrawingBrush.color = color;
      }
    });

    // 2. หากมีวัตถุที่เลือกอยู่ (ทั้งชิ้นเดี่ยวหรือหลายชิ้นใน ActiveSelection) ให้เปลี่ยนสีทุกอันพร้อมกัน
    if (selectedObject) {
      const isGroup =
        selectedObject.type === "activeSelection" ||
        typeof selectedObject.getObjects === "function";

      const objectsToUpdate = isGroup
        ? [...selectedObject.getObjects()]
        : [selectedObject];

      const affectedPages = new Set();
      const patchPromises = [];

      objectsToUpdate.forEach((obj) => {
        const pageNum = obj.pageNumber || currentPageRef.current;
        affectedPages.add(pageNum);

        // เปลี่ยนสีตามประเภทของวัตถุ
        if (obj.noteType === "D" || obj.type === "path") {
          obj.set({ stroke: color });
        } else if (obj.noteType === "T" || obj.type === "textbox") {
          obj.set({ fill: color });
        } else if (obj.noteType === "H" || obj.type === "rect") {
          obj.set({ fill: color });
        } else {
          if ("stroke" in obj && obj.stroke) obj.set({ stroke: color });
          if ("fill" in obj && obj.fill) obj.set({ fill: color });
        }

        obj.color = color;

        // บันทึกสีใหม่ลงฐานข้อมูล
        if (obj.noteId) {
          patchPromises.push(
            fetch(`/api/documents/${documentId}/notes/${obj.noteId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ color }),
            }).catch((err) => console.error("Update note color error:", err))
          );
        }
      });

      // สั่ง render ซ้ำบนทุกหน้าที่มีวัตถุที่เปลี่ยนสี
      pageRefsMap.current.forEach((pageData) => {
        if (pageData.fabricInstance) {
          pageData.fabricInstance.requestRenderAll();
        }
      });

      if (patchPromises.length > 0) {
        await Promise.all(patchPromises);
      }

      affectedPages.forEach((pg) => {
        fetchNotesForPage(pg);
      });
    }
  }

  function handleChangeStrokeWidth(width) {
    setStrokeWidth(width);
    strokeWidthRef.current = width;

    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (fCanvas?.freeDrawingBrush) {
        fCanvas.freeDrawingBrush.width = width;
      }
    });
  }

  // ลบโน้ตที่กำลังเลือกอยู่ (รองรับทั้งชิ้นเดี่ยวและหลายชิ้นในกลุ่ม ActiveSelection พร้อมกัน)
  async function handleDeleteSelected() {
    if (!selectedObject) return;

    const isGroup =
      selectedObject.type === "activeSelection" ||
      typeof selectedObject.getObjects === "function";

    const objectsToDelete = isGroup
      ? [...selectedObject.getObjects()]
      : [selectedObject];

    const affectedPages = new Set();
    const noteIdsToDelete = [];

    // ยกเลิกการเลือกบนทุก Canvas ก่อนเพื่อความปลอดภัยในการลบวัตถุออกจาก Canvas
    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (fCanvas) {
        fCanvas.discardActiveObject();
      }
    });
    setSelectedObject(null);

    objectsToDelete.forEach((obj) => {
      const pageNum = obj.pageNumber || currentPageRef.current;
      affectedPages.add(pageNum);
      if (obj.noteId) noteIdsToDelete.push(obj.noteId);

      pageRefsMap.current.forEach((pageData) => {
        const fCanvas = pageData.fabricInstance;
        if (fCanvas && fCanvas.getObjects().includes(obj)) {
          fCanvas.remove(obj);
        }
      });
    });

    pageRefsMap.current.forEach((pageData) => {
      const fCanvas = pageData.fabricInstance;
      if (fCanvas) {
        fCanvas.requestRenderAll();
      }
    });

    const deletePromises = noteIdsToDelete.map((nid) =>
      fetch(`/api/documents/${documentId}/notes/${nid}`, {
        method: "DELETE",
      }).catch((err) => console.error("Delete note error:", err))
    );

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    affectedPages.forEach((pg) => {
      fetchNotesForPage(pg);
    });
  }

  // ฟังก์ชัน UNDO (เลิกทำ)
  async function handleUndo() {
    if (undoStackRef.current.length === 0) return;
    const action = undoStackRef.current.pop();
    setUndoStack([...undoStackRef.current]);

    const pageData = pageRefsMap.current.get(action.pageNum);
    const fCanvas = pageData?.fabricInstance;

    if (action.type === "add") {
      if (action.note?.note_id) {
        try {
          await fetch(`/api/documents/${documentId}/notes/${action.note.note_id}`, {
            method: "DELETE",
          });
        } catch (e) {
          console.error("Undo add error:", e);
        }
      }

      if (action.fabricObject && fCanvas) {
        fCanvas.remove(action.fabricObject);
        fCanvas.discardActiveObject();
        fCanvas.renderAll();
      }

      redoStackRef.current.push(action);
      setRedoStack([...redoStackRef.current]);
      fetchNotesForPage(action.pageNum);
    } else if (action.type === "delete") {
      try {
        const res = await fetch(`/api/documents/${documentId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note_type: action.note.note_type,
            content: action.note.content,
            page_number: action.note.page_number,
            position_x: action.note.position_x,
            position_y: action.note.position_y,
            color: action.note.color,
          }),
        });

        const data = await res.json();
        if (data.note && fCanvas && fabricModuleRef.current) {
          const dims = pageData?.viewportDims || { width: 800, height: 1100 };
          const newObj = renderNoteOnCanvas(
            fabricModuleRef.current,
            fCanvas,
            data.note,
            dims.width,
            dims.height
          );
          action.fabricObject = newObj;
          action.restoredNote = data.note;
          redoStackRef.current.push(action);
          setRedoStack([...redoStackRef.current]);
          fetchNotesForPage(action.pageNum);
        }
      } catch (e) {
        console.error("Undo delete error:", e);
      }
    }
  }

  // ฟังก์ชัน REDO (ทำซ้ำ)
  async function handleRedo() {
    if (redoStackRef.current.length === 0) return;
    const action = redoStackRef.current.pop();
    setRedoStack([...redoStackRef.current]);

    const pageData = pageRefsMap.current.get(action.pageNum);
    const fCanvas = pageData?.fabricInstance;

    if (action.type === "add") {
      try {
        const res = await fetch(`/api/documents/${documentId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note_type: action.note.note_type,
            content: action.note.content,
            page_number: action.note.page_number,
            position_x: action.note.position_x,
            position_y: action.note.position_y,
            color: action.note.color,
          }),
        });

        const data = await res.json();
        if (data.note && fCanvas && fabricModuleRef.current) {
          const dims = pageData?.viewportDims || { width: 800, height: 1100 };
          const newObj = renderNoteOnCanvas(
            fabricModuleRef.current,
            fCanvas,
            data.note,
            dims.width,
            dims.height
          );
          action.fabricObject = newObj;
          action.note = data.note;
          undoStackRef.current.push(action);
          setUndoStack([...undoStackRef.current]);
          fetchNotesForPage(action.pageNum);
        }
      } catch (e) {
        console.error("Redo add error:", e);
      }
    } else if (action.type === "delete") {
      const targetId = action.restoredNote?.note_id || action.note?.note_id;
      if (targetId) {
        try {
          await fetch(`/api/documents/${documentId}/notes/${targetId}`, {
            method: "DELETE",
          });
        } catch (e) {
          console.error("Redo delete error:", e);
        }
      }

      if (action.fabricObject && fCanvas) {
        fCanvas.remove(action.fabricObject);
        fCanvas.discardActiveObject();
        fCanvas.renderAll();
      }

      undoStackRef.current.push(action);
      setUndoStack([...undoStackRef.current]);
      fetchNotesForPage(action.pageNum);
    }
  }

  // รองรับปุ่มคีย์บอร์ด Delete / Backspace, Undo (Ctrl+Z), Redo (Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    function handleKeyDown(e) {
      const activeElement = document.activeElement;
      if (activeElement && ["INPUT", "TEXTAREA"].includes(activeElement.tagName)) return;

      // Check if any fabric textbox is being edited
      let isEditing = false;
      pageRefsMap.current.forEach((pageData) => {
        if (pageData.fabricInstance?.getActiveObject()?.isEditing) {
          isEditing = true;
        }
      });
      if (isEditing) return;

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Redo: Ctrl+Y หรือ Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        handleDeleteSelected();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedObject, allNotes]);

  // จำนวนและประเภทของโน้ตที่กำลังเลือกอยู่
  const selectedCount = useMemo(() => {
    if (!selectedObject) return 0;
    if (selectedObject.type === "activeSelection" || typeof selectedObject.getObjects === "function") {
      return selectedObject.getObjects().length;
    }
    return 1;
  }, [selectedObject]);

  const selectedType = useMemo(() => {
    if (!selectedObject) return null;
    if (selectedObject.noteType) return selectedObject.noteType;
    if (selectedObject.type === "activeSelection" || typeof selectedObject.getObjects === "function") {
      const objs = selectedObject.getObjects ? selectedObject.getObjects() : [];
      return objs[0]?.noteType || null;
    }
    return null;
  }, [selectedObject]);

  // Compute estimated page height for placeholder
  const estimatedPageHeight = Math.round((scale * 842)); // A4 height at 72dpi ≈ 842
  const estimatedPageWidth = Math.round((scale * 595));  // A4 width at 72dpi ≈ 595

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-gray-100 overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-sm z-20">
        {/* Left: Page Navigation + Undo/Redo */}
        <div className="flex items-center gap-2">
          {/* Page Navigator */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => jumpToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg hover:bg-white text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="หน้าก่อนหน้า"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <span className="text-xs font-semibold px-2 text-gray-700">
              {currentPage} / {numPages || 1}
            </span>

            <button
              onClick={() => jumpToPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              className="p-1.5 rounded-lg hover:bg-white text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="หน้าถัดไป"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Undo / Redo Buttons */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 rounded-lg text-gray-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
              title="เลิกทำ (Ctrl+Z)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2m-15-7l4-4m-4 4l4 4" />
              </svg>
            </button>

            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg text-gray-700 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
              title="ทำซ้ำ (Ctrl+Y)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" />
              </svg>
            </button>
          </div>
        </div>

        {/* Center: Annotation Tools */}
        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
          {/* Tool: Select */}
          <button
            onClick={() => handleSelectTool("select")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTool === "select"
                ? "bg-white text-indigo-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
            title="เครื่องมือเลือกและเคลื่อนย้าย"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            เลือก
          </button>

          {/* Tool: Draw (D) */}
          <button
            onClick={() => handleSelectTool("draw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTool === "draw"
                ? "bg-white text-indigo-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
            title="วาดเขียนด้วยปากกา (D - Drawing)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            ปากกา
          </button>

          {/* Tool: Text (T) */}
          <button
            onClick={() => handleSelectTool("text")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTool === "text"
                ? "bg-white text-indigo-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
            title="พิมพ์ข้อความ (T - Text)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M12 6v14m-4 0h8" />
            </svg>
            ข้อความ
          </button>

          {/* Tool: Highlight (H) */}
          <button
            onClick={() => handleSelectTool("highlight")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTool === "highlight"
                ? "bg-white text-amber-700 shadow-sm font-semibold"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            }`}
            title="ไฮไลต์ข้อความ (H - Highlight)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            ไฮไลต์
          </button>

          {/* Delete tool button */}
          {selectedObject && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors animate-fade-in cursor-pointer"
              title={`ลบรายการที่เลือก${selectedCount > 1 ? ` ทั้ง ${selectedCount} รายการพร้อมกัน` : ""} (Delete)`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>ลบ{selectedCount > 1 ? ` (${selectedCount})` : ""}</span>
            </button>
          )}
        </div>

        {/* Color Palette & Stroke Controls */}
        <div className="flex items-center gap-2">
          {/* Colors */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-50 border border-gray-200 rounded-xl">
            {(selectedType === "H" || (activeTool === "highlight" && !selectedType)
              ? HIGHLIGHT_COLORS
              : DRAW_COLORS
            ).map((c) => (
              <button
                key={c}
                onClick={() => handleChangeColor(c)}
                className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                  currentColor === c ? "scale-125 border-gray-900 shadow-sm" : "border-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
                title={`เปลี่ยนสี${selectedCount > 1 ? ` ทั้ง ${selectedCount} รายการ` : ""} เป็น ${c}`}
              />
            ))}
          </div>

          {/* Stroke Width Selector (for Draw mode) */}
          {activeTool === "draw" && (
            <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
              {[2, 4, 6].map((w) => (
                <button
                  key={w}
                  onClick={() => handleChangeStrokeWidth(w)}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold ${
                    strokeWidth === w ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {w === 2 ? "บาง" : w === 4 ? "กลาง" : "หนา"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Zoom & AI Summary Button */}
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1 text-xs">
            <button
              onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
              className="p-1 rounded hover:bg-white text-gray-600 transition-colors"
              title="ย่อ"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <span className="w-12 text-center font-medium text-gray-700">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
              className="p-1 rounded hover:bg-white text-gray-600 transition-colors"
              title="ขยาย"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Notes List Button */}
          {onOpenNotesPanel && (
            <button
              onClick={onOpenNotesPanel}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold shadow-2xs transition-all hover:border-indigo-300 cursor-pointer"
              title="ดูโน้ตทั้งหมดในเอกสาร"
              id="btn-open-notes-panel-toolbar"
            >
              <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>โน้ตทั้งหมด</span>
            </button>
          )}

          {/* AI Summary Button */}
          <button
            onClick={onOpenAiSummary}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition-all hover:shadow"
            id="btn-ai-summary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>สรุปเนื้อหาด้วย AI</span>
          </button>
        </div>
      </div>

      {/* Main Workspace: Scrollable Multi-Page View */}
      <div className="flex-1 flex overflow-hidden relative">
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto p-6 flex flex-col items-center gap-4 relative w-full"
        >
          {loading ? (
            <div className="py-24 text-center text-gray-400">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">กำลังเตรียมเอกสาร PDF และเครื่องมือจดบันทึก...</p>
            </div>
          ) : error ? (
            <div className="m-auto card p-8 text-center text-red-600 bg-red-50/50 border-red-200 max-w-md">
              <p className="text-sm font-semibold">{error}</p>
            </div>
          ) : (
            Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                data-page-num={pageNum}
                ref={(el) => {
                  if (el) {
                    pageContainerRefs.current.set(pageNum, el);
                  } else {
                    pageContainerRefs.current.delete(pageNum);
                  }
                }}
                className="relative shadow-xl rounded-lg bg-white overflow-hidden border border-gray-200 transition-all flex-shrink-0"
                style={{ minWidth: estimatedPageWidth, minHeight: estimatedPageHeight }}
              >
                {/* Page number badge */}
                <div className="absolute top-2 left-2 z-20 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-md pointer-events-none">
                  {pageNum}
                </div>
                {/* Placeholder/loading indicator before render */}
                {!renderedPagesRef.current.has(pageNum) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 text-gray-300">
                    <div className="text-center">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <span className="text-xs">หน้า {pageNum}</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Saving Indicator */}
        {isSavingNote && (
          <div className="fixed bottom-6 right-8 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-gray-200 text-xs font-medium text-gray-700 flex items-center gap-2 animate-fade-in z-30">
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            กำลังบันทึกโน้ตลงฐานข้อมูล...
          </div>
        )}

        {/* Mini Page Navigator (right edge) */}
        {numPages > 1 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-1.5 shadow-lg max-h-[60vh] overflow-y-auto">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => jumpToPage(pageNum)}
                className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${
                  currentPage === pageNum
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                }`}
                title={`ไปที่หน้า ${pageNum}`}
              >
                {pageNum}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
