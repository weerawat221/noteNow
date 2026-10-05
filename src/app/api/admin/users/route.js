import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 * ดึงรายชื่อผู้ใช้ทั้งหมดในระบบ พร้อมสถานะ Gemini Key และจำนวนเอกสาร
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { adminClient } = auth;

    // ดึงผู้ใช้ทั้งหมด พร้อมเอกสารและสรุป AI เพื่อทำ count
    const [usersRes, docsRes, summariesRes] = await Promise.all([
      adminClient
        .from("users")
        .select(`
          user_id,
          email,
          first_name,
          last_name,
          profile_image,
          role,
          is_suspended,
          created_at,
          updated_at,
          gemini_api_key_enc
        `)
        .order("user_id", { ascending: true }),
      adminClient.from("documents").select("document_id, user_id"),
      adminClient.from("ai_summaries").select("summary_id, user_id"),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (docsRes.error) throw docsRes.error;
    if (summariesRes.error) throw summariesRes.error;

    const users = usersRes.data || [];
    const documents = docsRes.data || [];
    const summaries = summariesRes.data || [];

    // นับจำนวนเอกสารต่อ user
    const docCounts = {};
    documents.forEach((d) => {
      docCounts[d.user_id] = (docCounts[d.user_id] || 0) + 1;
    });

    // นับจำนวนสรุปต่อ user
    const summaryCounts = {};
    summaries.forEach((s) => {
      summaryCounts[s.user_id] = (summaryCounts[s.user_id] || 0) + 1;
    });

    const enrichedUsers = users.map((u) => {
      const hasKey = Boolean(u.gemini_api_key_enc);
      const { gemini_api_key_enc, ...safeUser } = u;

      return {
        ...safeUser,
        has_gemini_key: hasKey,
        documents_count: docCounts[u.user_id] || 0,
        summaries_count: summaryCounts[u.user_id] || 0,
      };
    });

    return NextResponse.json({ users: enrichedUsers });
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้" },
      { status: 500 }
    );
  }
}
