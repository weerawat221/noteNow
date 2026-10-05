import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserGeminiKey } from "@/lib/gemini";
import { getValidGoogleToken } from "@/lib/google-drive";
import { summaryLock } from "@/lib/summary-lock";
import { SUMMARY_ERRORS, parseSummaryError } from "@/lib/summary-errors";
import { validateDriveFile, downloadDrivePdfBuffer } from "@/lib/summary-drive";
import {
  preparePdfPart,
  verifyTokenCount,
  deleteGeminiFile,
  executeGenerateContentStream,
} from "@/lib/gemini-summary";
import { SUMMARY_CONFIG } from "@/config/summary";
import { SUMMARY_SYSTEM_INSTRUCTION } from "@/lib/summaryPrompt";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 120; // 120 วินาทีตามสถาปัตยกรรมที่กำหนด
export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

function isOriginValid(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * GET /api/documents/[id]/summaries
 * คืนค่าสรุปล่าสุด และรายการสรุปครั้งก่อน ๆ ทั้งหมดของเอกสารนี้
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("user_id")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (!userData) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    // ดึงสรุปทั้งหมดของเอกสารนี้ของผู้ใช้นี้ เรียงจากใหม่ไปเก่า
    const { data: summaries, error } = await admin
      .from("ai_summaries")
      .select("summary_id, summary_content, created_at")
      .eq("document_id", id)
      .eq("user_id", userData.user_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const latest = summaries && summaries.length > 0 ? summaries[0] : null;
    const items = (summaries || []).map((s) => ({
      summary_id: s.summary_id,
      created_at: s.created_at,
    }));

    return NextResponse.json(
      { latest, items },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/documents/[id]/summaries
 * สร้างสรุปเนื้อหาทั้งเอกสารแบบ Server-Sent Events (SSE) Streaming
 */
export async function POST(request, { params }) {
  if (!isOriginValid(request)) {
    return NextResponse.json(
      { error: "Invalid Origin (CSRF)" },
      { status: 403, headers: NO_CACHE_HEADERS }
    );
  }

  const { id: documentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  const admin = createAdminClient();
  const { data: userData } = await admin
    .from("users")
    .select("user_id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!userData) {
    return NextResponse.json(
      { error: "ไม่พบข้อมูลผู้ใช้ในระบบ" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  const userId = userData.user_id;

  // 1. ตรวจสอบความเป็นเจ้าของเอกสารและดึง google_file_id
  const { data: doc, error: docError } = await admin
    .from("documents")
    .select("document_id, document_name, google_file_id, file_size")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (docError || !doc) {
    return NextResponse.json(
      { error: "ไม่พบเอกสารนี้ หรือคุณไม่มีสิทธิ์เข้าถึง" },
      { status: 404, headers: NO_CACHE_HEADERS }
    );
  }

  // 2. ตรวจสอบ Lock & Concurrency & Rate Limit
  const lockResult = summaryLock.acquire(userId, documentId);
  if (!lockResult.success) {
    const errorInfo = SUMMARY_ERRORS[lockResult.reason] || SUMMARY_ERRORS.BUSY;
    return NextResponse.json(
      { code: errorInfo.code, error: errorInfo.message },
      {
        status: errorInfo.status,
        headers: {
          ...NO_CACHE_HEADERS,
          ...(lockResult.retryAfter ? { "Retry-After": String(lockResult.retryAfter) } : {}),
        },
      }
    );
  }

  // เตรียม SSE Stream Response
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return writer.write(encoder.encode(payload));
  };

  // รวม AbortSignal จาก Client
  const clientSignal = request.signal;
  let isCleanedUp = false;
  let uploadedFileName = null;
  let geminiKey = null;

  // Cleanup handler
  const cleanup = async () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    summaryLock.release(userId, documentId);
    if (uploadedFileName && geminiKey) {
      await deleteGeminiFile(geminiKey, uploadedFileName);
    }
  };

  // จัดการ Process หลักใน Background ของ Stream
  (async () => {
    const startTime = Date.now();
    let accumulatedText = "";

    try {
      // ตรวจสอบ Gemini Key
      geminiKey = await getUserGeminiKey(userId);
      if (!geminiKey) {
        await sendEvent("error", SUMMARY_ERRORS.GEMINI_KEY_MISSING);
        return;
      }

      // ตรวจสอบ Google OAuth Token
      const googleToken = await getValidGoogleToken(user.id);
      if (!googleToken) {
        await sendEvent("error", SUMMARY_ERRORS.DRIVE_AUTH);
        return;
      }

      console.log(
        JSON.stringify({
          event: "summary_started",
          userId,
          documentId,
          timestamp: new Date().toISOString(),
        })
      );

      // ขั้นที่ 1: ตรวจสอบ Metadata จาก Drive
      await sendEvent("status", {
        step: "checking",
        message: "กำลังตรวจสอบข้อมูลเอกสารบน Google Drive...",
      });
      await validateDriveFile(googleToken, doc.google_file_id, clientSignal);

      // ขั้นที่ 2: ดึงไฟล์ PDF จาก Drive
      await sendEvent("status", {
        step: "fetching_drive",
        message: "กำลังดาวน์โหลดไฟล์ PDF จาก Google Drive...",
      });
      const pdfBuffer = await downloadDrivePdfBuffer(googleToken, doc.google_file_id, clientSignal);

      // ขั้นที่ 3: เตรียมข้อมูลส่งให้ Gemini (Inline หรือ Files API)
      await sendEvent("status", {
        step: "uploading_gemini",
        message: "กำลังส่งไฟล์ PDF ให้ Gemini AI ประมวลผล...",
      });
      const prepResult = await preparePdfPart(
        geminiKey,
        pdfBuffer,
        doc.document_name,
        clientSignal
      );
      uploadedFileName = prepResult.uploadedFileName;

      // สร้าง Client instance ต่อ request
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      // ขั้นที่ 4: ประเมินขนาด Token ล่วงหน้า
      await sendEvent("status", {
        step: "counting_tokens",
        message: "กำลังประเมินความยาวเนื้อหาของเอกสาร...",
      });
      await verifyTokenCount(ai, prepResult.part);

      // ขั้นที่ 5: เรียก Stream Generation พร้อม Auto-Fallback ป้องกัน 503
      await sendEvent("status", {
        step: "generating",
        message: "กำลังวิเคราะห์และเรียบเรียงบทสรุปเนื้อหา...",
      });

      const { stream: streamResult, usedModel } = await executeGenerateContentStream(
        ai,
        prepResult.part,
        SUMMARY_SYSTEM_INSTRUCTION,
        clientSignal
      );

      for await (const chunk of streamResult) {
        if (clientSignal?.aborted) {
          throw new Error("Client aborted");
        }

        const deltaText = chunk.text;
        if (deltaText) {
          accumulatedText += deltaText;
          await sendEvent("delta", { text: deltaText });
        }

        // ตรวจสอบ finishReason
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason === "MAX_TOKENS") {
          const truncationNote = "\n\n> ⚠️ *หมายเหตุ: สรุปเนื้อหาถูกตัดเนื่องจากความยาวเกินกำหนดสูงสุดของโมเดล*";
          accumulatedText += truncationNote;
          await sendEvent("delta", { text: truncationNote });
        } else if (candidate?.finishReason === "SAFETY") {
          const err = new Error("ติดนโยบายความปลอดภัย");
          err.code = "SUMMARY_BLOCKED";
          throw err;
        }
      }

      if (!accumulatedText.trim()) {
        const err = new Error("โมเดลไม่สามารถสร้างบทสรุปได้");
        err.code = "UPSTREAM_UNAVAILABLE";
        throw err;
      }

      // ขั้นที่ 6: บันทึกลงฐานข้อมูลเฉพาะเมื่อสำเร็จสมบูรณ์
      const { data: newSummary, error: dbError } = await admin
        .from("ai_summaries")
        .insert({
          document_id: doc.document_id,
          user_id: userId,
          summary_content: accumulatedText.trim(),
        })
        .select("summary_id, created_at")
        .single();

      if (dbError) {
        throw new Error("บันทึกผลสรุปลงฐานข้อมูลไม่สำเร็จ: " + dbError.message);
      }

      // ส่ง event done
      await sendEvent("done", {
        summary_id: newSummary.summary_id,
        created_at: newSummary.created_at,
      });

      console.log(
        JSON.stringify({
          event: "summary_done",
          userId,
          documentId,
          summaryId: newSummary.summary_id,
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (err) {
      if (clientSignal?.aborted) {
        console.log(
          JSON.stringify({
            event: "summary_aborted_by_client",
            userId,
            documentId,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const parsedErr = parseSummaryError(err);
      console.warn(
        JSON.stringify({
          event: "summary_failed",
          userId,
          documentId,
          errorCode: parsedErr.code,
          errorMessage: err?.message || String(err),
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        })
      );

      await sendEvent("error", {
        code: parsedErr.code,
        message: parsedErr.message,
      });
    } finally {
      await cleanup();
      try {
        await writer.close();
      } catch {
        // stream already closed
      }
    }
  })();

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // ปิด proxy buffering สำหรับ Nginx
    },
  });
}
