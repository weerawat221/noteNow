import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/documents
 * ดึงรายการเอกสารทั้งหมดของผู้ใช้ทุกคนในระบบ พร้อมข้อมูลเจ้าของไฟล์
 */
export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { adminClient } = auth;

    // ดึงเอกสารทั้งหมดพร้อมข้อมูลตารางที่เกี่ยวข้อง
    const { data: documents, error: docsError } = await adminClient
      .from("documents")
      .select(`
        document_id,
        document_name,
        file_type,
        file_size,
        google_file_id,
        google_file_url,
        connected_at,
        updated_at,
        user_id,
        users (
          user_id,
          email,
          first_name,
          last_name,
          profile_image
        ),
        ai_summaries (
          summary_id,
          created_at
        ),
        notes (
          created_at,
          updated_at
        )
      `)
      .order("connected_at", { ascending: false });

    if (docsError) {
      throw docsError;
    }

    const processedDocs = (documents || []).map((doc) => {
      let latest_note_at = null;
      if (doc.notes && doc.notes.length > 0) {
        for (const n of doc.notes) {
          const t = n.updated_at || n.created_at;
          if (t) {
            if (!latest_note_at || new Date(t) > new Date(latest_note_at)) {
              latest_note_at = t;
            }
          }
        }
      }

      const { notes, ...rest } = doc;
      return {
        ...rest,
        notes_count: notes ? notes.length : 0,
        latest_note_at,
        ai_summaries_count: doc.ai_summaries ? doc.ai_summaries.length : 0,
      };
    });

    return NextResponse.json({ documents: processedDocs });
  } catch (err) {
    console.error("GET /api/admin/documents error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการดึงรายการเอกสาร" },
      { status: 500 }
    );
  }
}
