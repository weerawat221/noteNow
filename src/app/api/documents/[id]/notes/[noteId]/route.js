import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateNoteContent } from "@/lib/validators";

/**
 * DELETE /api/documents/[id]/notes/[noteId]
 * ลบโน้ตเดี่ยว
 */
export async function DELETE(request, { params }) {
  try {
    const { id, noteId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: deleteError } = await supabase
      .from("notes")
      .delete()
      .eq("note_id", noteId)
      .eq("document_id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE note error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/documents/[id]/notes/[noteId]
 * แก้ไขโน้ต (เช่น แก้ไขข้อความ พิกัด หรือสี)
 */
export async function PATCH(request, { params }) {
  try {
    const { id, noteId } = await params;
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

    if (body.content !== undefined) {
      // Validate content if note_type is provided or checked
      if (body.note_type) {
        const validation = validateNoteContent(body.note_type, body.content);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 });
        }
      }
      updates.content = body.content;
    }

    if (body.position_x !== undefined) updates.position_x = body.position_x;
    if (body.position_y !== undefined) updates.position_y = body.position_y;
    if (body.color !== undefined) updates.color = body.color;

    const { data: updated, error: updateError } = await supabase
      .from("notes")
      .update(updates)
      .eq("note_id", noteId)
      .eq("document_id", id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, note: updated });
  } catch (err) {
    console.error("PATCH note error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
