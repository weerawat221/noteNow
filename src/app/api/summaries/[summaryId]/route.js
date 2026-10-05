import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

/**
 * GET /api/summaries/[summaryId]
 * ดึงเนื้อหาของสรุปครั้งที่ระบุ (เฉพาะเจ้าของ)
 */
export async function GET(request, { params }) {
  try {
    const { summaryId } = await params;
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

    const { data: summary, error } = await admin
      .from("ai_summaries")
      .select("summary_id, document_id, summary_content, created_at, user_id")
      .eq("summary_id", summaryId)
      .eq("user_id", userData.user_id)
      .maybeSingle();

    if (error || !summary) {
      return NextResponse.json(
        { error: "ไม่พบบทสรุปนี้ หรือคุณไม่มีสิทธิ์เข้าถึง" },
        { status: 404, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        summary_id: summary.summary_id,
        document_id: summary.document_id,
        summary_content: summary.summary_content,
        created_at: summary.created_at,
      },
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
 * DELETE /api/summaries/[summaryId]
 * ลบบทสรุปครั้งที่ระบุ (เฉพาะเจ้าของ)
 */
export async function DELETE(request, { params }) {
  try {
    const { summaryId } = await params;
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

    // ลบเฉพาะแถวที่ user_id ตรงกัน
    const { error } = await admin
      .from("ai_summaries")
      .delete()
      .eq("summary_id", summaryId)
      .eq("user_id", userData.user_id);

    if (error) {
      return NextResponse.json(
        { error: "ไม่สามารถลบสรุปได้" },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      { success: true },
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
