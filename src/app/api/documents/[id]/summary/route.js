import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserGeminiKey } from "@/lib/gemini";
import { getValidGoogleToken, getDriveFileStream } from "@/lib/google-drive";
import { GoogleGenAI } from "@google/genai";

/**
 * GET /api/documents/[id]/summary
 * ดึงสรุป AI ที่เคยสร้างไว้สำหรับเอกสารนี้
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: summary, error } = await supabase
      .from("ai_summaries")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ summary: summary || null });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/documents/[id]/summary
 * สรุปเนื้อหาทั้งฉบับด้วย Gemini โดยใช้ API Key ของผู้ใช้เอง
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // 1. ดึงข้อมูลผู้ใช้เพื่อเอา Gemini API Key และ User ID
    const { data: userData, error: userError } = await admin
      .from("users")
      .select("user_id, gemini_api_key_enc")
      .eq("auth_id", user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: "ไม่พบข้อมูลผู้ใช้ในระบบ" }, { status: 400 });
    }

    if (!userData.gemini_api_key_enc) {
      return NextResponse.json(
        {
          error: "no_gemini_key",
          message: "กรุณาตั้งค่า Gemini API Key ในหน้าตั้งค่าก่อนใช้งานสรุปเนื้อหา",
        },
        { status: 400 }
      );
    }

    // 2. ดึงข้อมูล document
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("document_id, document_name, google_file_id, file_size")
      .eq("document_id", id)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: "ไม่พบเอกสารนี้ในระบบ" }, { status: 404 });
    }

    // 3. ดึง Google Token เพื่อโหลดไฟล์ PDF จาก Drive
    const googleToken = await getValidGoogleToken(user.id);
    if (!googleToken) {
      return NextResponse.json(
        { error: "ไม่สามารถเข้าถึงไฟล์บน Google Drive ได้ กรุณาเชื่อมต่อใหม่อีกครั้ง" },
        { status: 403 }
      );
    }

    // 4. สตรีมไฟล์ PDF จาก Google Drive
    const streamRes = await getDriveFileStream(googleToken, doc.google_file_id);
    const pdfBuffer = await streamRes.arrayBuffer();

    if (pdfBuffer.byteLength > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 20MB สำหรับการสรุป)" },
        { status: 400 }
      );
    }

    // 5. ดึงและถอดรหัส Gemini API Key ของผู้ใช้ (server-only ไม่ cache plaintext)
    const geminiKey = await getUserGeminiKey(userData.user_id);
    if (!geminiKey) {
      return NextResponse.json(
        {
          error: "no_gemini_key",
          message: "กรุณาตั้งค่า Gemini API Key ในหน้าตั้งค่าก่อนใช้งานสรุปเนื้อหา",
        },
        { status: 400 }
      );
    }

    const modelName = process.env.GEMINI_MODEL_NAME || "gemini-2.0-flash";
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const base64Pdf = Buffer.from(pdfBuffer).toString("base64");

    const prompt = `คุณคือผู้ช่วยสรุปเนื้อหาบทเรียนและเอกสารทางวิชาการภาษาไทย (NoteNow AI)
โปรดสรุปเนื้อหาสำคัญของเอกสารนี้ทั้งฉบับอย่างกระชับ ครอบคลุม ชัดเจน และเข้าใจง่าย โดยจัดรูปแบบเป็นโครงสร้างดังนี้:
1. 📌 วัตถุประสงค์และภาพรวมของเอกสาร
2. 🔑 ประเด็นสำคัญและหัวข้อหลัก (จัดเป็นข้อๆ พร้อมคำอธิบายสั้นๆ)
3. 💡 สรุปใจความสำคัญและข้อคิดหรือการนำไปใช้
(กรุณาใช้ภาษาไทยที่สละสลวย อ่านง่าย ไม่เยิ่นเย้อ และใช้ Markdown ในการจัดรูปแบบ)`;

    let summaryText = "";
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: base64Pdf,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });

      summaryText = response.text || "";
    } catch (aiErr) {
      const errMsg = String(aiErr?.message || "");
      const isAuthError =
        errMsg.includes("API_KEY_INVALID") ||
        errMsg.includes("403") ||
        errMsg.includes("API key not valid");

      if (isAuthError) {
        // Log เฉพาะ Event ห้าม log key หรือ error stack ที่อาจมี token
        console.warn(
          JSON.stringify({
            event: "gemini_key_invalid_on_summary",
            userId: userData.user_id,
            timestamp: new Date().toISOString(),
          })
        );
        return NextResponse.json(
          {
            error: "GEMINI_KEY_INVALID",
            message: "Gemini API Key ใช้งานไม่ได้ กรุณาตรวจสอบหรือใส่ key ใหม่ในหน้าตั้งค่า",
          },
          { status: 400 }
        );
      }

      if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429")) {
        return NextResponse.json(
          {
            error: "GEMINI_QUOTA_EXCEEDED",
            message: "โควต้าของ Gemini API Key เต็ม กรุณารอสักครู่หรือเปลี่ยนคีย์ในหน้าตั้งค่า",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "เกิดข้อผิดพลาดในการประมวลผลสรุปเนื้อหา กรุณาลองใหม่อีกครั้ง" },
        { status: 500 }
      );
    }

    if (!summaryText.trim()) {
      return NextResponse.json(
        { error: "ไม่สามารถสร้างสรุปเนื้อหาได้ กรุณาลองใหม่อีกครั้ง" },
        { status: 500 }
      );
    }

    // 6. บันทึกลงตาราง ai_summaries
    const { data: newSummary, error: summaryDbError } = await supabase
      .from("ai_summaries")
      .insert({
        document_id: doc.document_id,
        user_id: userData.user_id,
        summary_content: summaryText.trim(),
      })
      .select()
      .single();

    if (summaryDbError) {
      console.error("Error inserting ai_summary:", summaryDbError);
      return NextResponse.json({ error: summaryDbError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, summary: newSummary }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents/[id]/summary error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
