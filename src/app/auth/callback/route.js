import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

/**
 * GET /auth/callback
 * Google OAuth callback — แลก code เป็น session
 * บันทึก encrypted tokens ลงตาราง users ตามข้อกำหนด skill.md
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.session) {
      const { user, provider_token, provider_refresh_token, expires_at } = data.session;

      if (user) {
        try {
          const adminSupabase = createAdminClient();
          const updates = {
            updated_at: new Date().toISOString(),
          };

          if (provider_token) {
            updates.google_access_token_enc = encrypt(provider_token);
          }
          if (provider_refresh_token) {
            updates.google_refresh_token_enc = encrypt(provider_refresh_token);
          }
          if (expires_at) {
            updates.google_token_expires_at = new Date(expires_at * 1000).toISOString();
          }

          // ตรวจสอบสถานะการระงับและ role ของผู้ใช้
          const { data: userRow } = await adminSupabase
            .from("users")
            .select("user_id, role, is_suspended")
            .eq("auth_id", user.id)
            .maybeSingle();

          if (userRow?.is_suspended) {
            await supabase.auth.signOut();
            return NextResponse.redirect(`${origin}/login?error=suspended`);
          }

          // อัปเดตข้อมูล user และ tokens
          await adminSupabase
            .from("users")
            .update(updates)
            .eq("auth_id", user.id);

          const defaultNext = "/dashboard";
          const targetUrl = searchParams.get("next") ?? defaultNext;
          return NextResponse.redirect(`${origin}${targetUrl}`);
        } catch (err) {
          console.error("Error saving encrypted google tokens:", err);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // ถ้า error หรือไม่มี code → redirect กลับ login พร้อม error message
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
