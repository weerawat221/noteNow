import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/secrets";
import { validateGeminiKey } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rate-limiter";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

/**
 * ตรวจสอบ Origin / CSRF เบื้องต้นสำหรับคำขอประเภท State-changing
 */
function isOriginValid(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return true;

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * GET /api/settings/gemini-key
 * ตรวจสอบสถานะการตั้งค่า Gemini API Key ของผู้ใช้
 * คืนค่าเฉพาะ boolean { hasKey } ห้ามส่ง key หรือ ciphertext เด็ดขาด
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    const admin = createAdminClient();
    const { data: userData, error: dbError } = await admin
      .from("users")
      .select("gemini_api_key_enc")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (dbError) {
      return NextResponse.json(
        { error: "เกิดข้อผิดพลาดในการดึงข้อมูล" },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const hasKey = Boolean(userData && userData.gemini_api_key_enc);

    return NextResponse.json({ hasKey }, { headers: NO_CACHE_HEADERS });
  } catch {
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดภายในระบบ" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * PUT /api/settings/gemini-key
 * บันทึกหรือเปลี่ยน Gemini API Key ของผู้ใช้
 * - ตรวจสอบ Session & CSRF
 * - Rate Limit: 5 ครั้ง / 10 นาที / ผู้ใช้
 * - Validate กับ Google Models API
 * - เข้ารหัส AES-256-GCM ผูก AAD (userId) ก่อนบันทึกลง users
 */
export async function PUT(request) {
  if (!isOriginValid(request)) {
    return NextResponse.json(
      { error: "คำขอไม่ถูกต้อง (CSRF detected)" },
      { status: 403, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" },
        { status: 401, headers: NO_CACHE_HEADERS }
      );
    }

    // ดึง user_id ภายในระบบ
    const admin = createAdminClient();
    const { data: userData, error: userError } = await admin
      .from("users")
      .select("user_id, gemini_api_key_enc")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (userError || !userData) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลบัญชีผู้ใช้ในระบบ" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // Rate Limit: สูงสุด 5 ครั้งต่อ 10 นาที (600 วินาที) ต่อผู้ใช้
    const rateLimitKey = `gemini_put:${userData.user_id}`;
    const rateCheck = checkRateLimit(rateLimitKey, 5, 600);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `คุณทำรายการบ่อยเกินไป กรุณารออีก ${rateCheck.retryAfterSeconds} วินาทีก่อนลองใหม่`,
        },
        {
          status: 429,
          headers: {
            ...NO_CACHE_HEADERS,
            "Retry-After": String(rateCheck.retryAfterSeconds),
          },
        }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง (JSON invalid)" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { apiKey } = body || {};

    // ตรวจสอบความถูกต้องเบื้องต้น ห้ามส่งต่อให้ Google ถ้าข้อมูลผิดปกติ
    if (typeof apiKey !== "string" || !apiKey.trim() || apiKey.trim().length > 500) {
      return NextResponse.json(
        { error: "รูปแบบ API Key ไม่ถูกต้อง หรือมีความยาวเกินขอบเขตที่กำหนด" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const cleanedKey = apiKey.trim();

    // ตรวจสอบกับ Gemini API
    const validationResult = await validateGeminiKey(cleanedKey);

    if (validationResult.status === "invalid") {
      // บันทึกเฉพาะ event ห้าม log ค่า key
      console.warn(
        JSON.stringify({
          event: "key_validation_failed",
          userId: userData.user_id,
          timestamp: new Date().toISOString(),
        })
      );
      return NextResponse.json(
        { error: validationResult.message },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (validationResult.status === "unreachable") {
      return NextResponse.json(
        { error: validationResult.message },
        { status: 503, headers: NO_CACHE_HEADERS }
      );
    }

    // สถานะ valid หรือ quota: บันทึกลงฐานข้อมูลแบบเข้ารหัส
    const isExisting = Boolean(userData.gemini_api_key_enc);
    const encryptedKey = encryptSecret(cleanedKey, {
      userId: userData.user_id,
    });

    const { error: updateError } = await admin
      .from("users")
      .update({ gemini_api_key_enc: encryptedKey })
      .eq("user_id", userData.user_id);

    if (updateError) {
      return NextResponse.json(
        { error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง" },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    // Log เหตุการณ์ความปลอดภัย (ไม่มี secret หรือ ciphertext)
    console.log(
      JSON.stringify({
        event: isExisting ? "key_replaced" : "key_added",
        userId: userData.user_id,
        timestamp: new Date().toISOString(),
      })
    );

    if (validationResult.status === "quota") {
      return NextResponse.json(
        {
          hasKey: true,
          warning:
            "บันทึก API Key แล้ว แต่คีย์นี้ติดโควต้าการใช้งานในขณะนี้ คุณอาจต้องรอให้โควต้ารีเซ็ตหรือตรวจสอบใน Google AI Studio ก่อนสรุปเอกสาร",
        },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { hasKey: true },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดภายในระบบ" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/settings/gemini-key
 * ลบ Gemini API Key ของผู้ใช้ โดยไม่ลบสรุปเอกสารใน ai_summaries
 */
export async function DELETE(request) {
  if (!isOriginValid(request)) {
    return NextResponse.json(
      { error: "คำขอไม่ถูกต้อง (CSRF detected)" },
      { status: 403, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" },
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
        { error: "ไม่พบข้อมูลบัญชีผู้ใช้ในระบบ" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const { error: updateError } = await admin
      .from("users")
      .update({ gemini_api_key_enc: null })
      .eq("user_id", userData.user_id);

    if (updateError) {
      return NextResponse.json(
        { error: "ไม่สามารถลบ API Key ได้ กรุณาลองใหม่อีกครั้ง" },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    console.log(
      JSON.stringify({
        event: "key_removed",
        userId: userData.user_id,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดภายในระบบ" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
