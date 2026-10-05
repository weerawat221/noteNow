import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/documents
 * ดึงรายการเอกสารทั้งหมดของผู้ใช้ที่เข้าสู่ระบบ
 */
export async function GET(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folder_id");

    let query = supabase
      .from("documents")
      .select(`
        document_id,
        document_name,
        file_type,
        google_file_id,
        google_file_url,
        file_size,
        connected_at,
        updated_at,
        folder_id,
        folders (
          folder_id,
          folder_name
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

    if (folderId === "root") {
      query = query.is("folder_id", null);
    } else if (folderId) {
      query = query.eq("folder_id", folderId);
    }

    const { data: documents, error } = await query;

    if (error) {
      console.error("Supabase documents select error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
        latest_note_at,
        notes_count: notes ? notes.length : 0,
      };
    });

    return NextResponse.json({ documents: processedDocs });
  } catch (err) {
    console.error("GET /api/documents error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * บันทึก metadata ของเอกสารที่เชื่อมต่อจาก Google Drive
 */
export async function POST(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ดึง user_id จาก users table
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("user_id")
      .eq("auth_id", user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { error: "ไม่พบข้อมูลผู้ใช้ในระบบ" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      document_name,
      google_file_id,
      google_file_url,
      file_size,
      folder_id,
    } = body;

    if (!document_name || !google_file_id) {
      return NextResponse.json(
        { error: "กรุณาระบุชื่อเอกสารและ Google File ID" },
        { status: 400 }
      );
    }

    // ตรวจสอบว่าเคยเชื่อมโยงไฟล์นี้แล้วหรือยัง (unique per user + google_file_id)
    const { data: existing } = await supabase
      .from("documents")
      .select("document_id, document_name")
      .eq("user_id", userData.user_id)
      .eq("google_file_id", google_file_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: "เอกสารนี้ถูกเชื่อมต่อไว้แล้วในระบบ",
          document: existing,
        },
        { status: 409 }
      );
    }

    const { data: newDoc, error: insertError } = await supabase
      .from("documents")
      .insert({
        user_id: userData.user_id,
        document_name: document_name.trim(),
        file_type: "pdf",
        google_file_id: google_file_id.trim(),
        google_file_url: google_file_url || `https://drive.google.com/file/d/${google_file_id}/view`,
        file_size: file_size ? parseInt(file_size, 10) : null,
        folder_id: folder_id ? parseInt(folder_id, 10) : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting document:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: newDoc }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
