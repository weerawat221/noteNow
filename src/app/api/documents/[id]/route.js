import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/documents/[id]
 * ยกเลิกการเชื่อมต่อเอกสาร (ลบเฉพาะใน NoteNow ตามเงื่อนไข ไม่แตะไฟล์ใน Google Drive)
 */
export async function DELETE(request, { params }) {
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

    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("document_id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/documents/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/documents/[id]
 * อัปเดตข้อมูลเอกสาร เช่น เปลี่ยนชื่อ หรือ ย้ายโฟลเดอร์
 */
export async function PATCH(request, { params }) {
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

    const body = await request.json();
    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (body.document_name !== undefined) {
      updates.document_name = body.document_name.trim();
    }
    if (body.folder_id !== undefined) {
      updates.folder_id = body.folder_id ? parseInt(body.folder_id, 10) : null;
    }

    const { data: updated, error: updateError } = await supabase
      .from("documents")
      .update(updates)
      .eq("document_id", id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: updated });
  } catch (err) {
    console.error("PATCH /api/documents/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
