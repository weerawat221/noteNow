import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { decryptSecret } from "@/lib/secrets";
import { validateGeminiKey } from "@/lib/gemini";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[userId]/test-key
 * แอดมินทดสอบความถูกต้องของ Gemini API Key ของผู้ใช้
 */
export async function POST(request, { params }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { userId } = await params;
    const targetUserId = parseInt(userId, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return NextResponse.json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    const { adminClient } = auth;
    const { data: userData, error: userError } = await adminClient
      .from("users")
      .select("user_id, email, gemini_api_key_enc")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (userError || !userData) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้ที่ระบุ" }, { status: 404 });
    }

    if (!userData.gemini_api_key_enc) {
      return NextResponse.json({
        has_key: false,
        status: "none",
        message: "ผู้ใช้ยังไม่ได้ลงทะเบียน Gemini API Key",
      });
    }

    // ถอดรหัสคีย์เพื่อทดสอบกับ Google API
    let plaintextKey;
    try {
      plaintextKey = decryptSecret(userData.gemini_api_key_enc, {
        userId: userData.user_id,
      });
    } catch (decryptErr) {
      console.error("Decrypt error for user key:", decryptErr);
      return NextResponse.json({
        has_key: true,
        status: "invalid",
        message: "ไม่สามารถถอดรหัส Key ได้ (Ciphertext หรือ Key Version เสียหาย)",
      });
    }

    const validationResult = await validateGeminiKey(plaintextKey);

    let message = "";
    if (validationResult.status === "valid") {
      message = "Gemini API Key ใช้งานได้ตามปกติ (Active)";
    } else if (validationResult.status === "invalid") {
      message = "Gemini API Key ไม่ถูกต้องหรือถูกเพิกถอน (Invalid)";
    } else if (validationResult.status === "quota") {
      message = "Gemini API Key ใช้งานเกินโควต้า (Quota Exceeded)";
    } else {
      message = "ไม่สามารถเชื่อมต่อไปยังเซิร์ฟเวอร์ Google ได้ชั่วคราว";
    }

    return NextResponse.json({
      has_key: true,
      status: validationResult.status,
      message,
    });
  } catch (err) {
    console.error("POST /api/admin/users/[userId]/test-key error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการตรวจสอบคีย์" },
      { status: 500 }
    );
  }
}
