import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/secrets";
import { validateGeminiKey } from "@/lib/gemini";
import { checkRateLimit } from "@/lib/rate-limiter";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

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
 * POST /api/settings/gemini-key/test
 * ทดสอบ Gemini API Key ที่บันทึกไว้ในปัจจุบันของผู้ใช้
 * ไม่รับ body, ไม่แก้ไขข้อมูลใน DB
 */
export async function POST(request) {
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

    // Rate Limit: สูงสุด 10 ครั้งต่อ 10 นาที (600 วินาที)
    const rateLimitKey = `gemini_test:${userData.user_id}`;
    const rateCheck = checkRateLimit(rateLimitKey, 10, 600);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `คุณทดสอบ Key บ่อยเกินไป กรุณารออีก ${rateCheck.retryAfterSeconds} วินาทีก่อนลองใหม่`,
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

    if (!userData.gemini_api_key_enc) {
      return NextResponse.json(
        { error: "ยังไม่ได้ตั้งค่า Gemini API Key ในระบบ" },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    let plaintextKey;
    try {
      plaintextKey = decryptSecret(userData.gemini_api_key_enc, {
        userId: userData.user_id,
      });
    } catch {
      return NextResponse.json(
        {
          status: "invalid",
          message:
            "ไม่สามารถถอดรหัส Key ได้ (Master Key อาจมีการเปลี่ยนแปลง) กรุณาบันทึก Key ใหม่อีกครั้ง",
        },
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }

    const result = await validateGeminiKey(plaintextKey);

    // Audit log (ห้ามมี key หรือ plaintext)
    console.log(
      JSON.stringify({
        event: "key_tested",
        userId: userData.user_id,
        status: result.status,
        timestamp: new Date().toISOString(),
      })
    );

    return NextResponse.json(
      {
        status: result.status,
        message: result.message,
      },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดภายในระบบ" },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
