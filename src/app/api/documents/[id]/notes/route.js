import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateNoteContent } from "@/lib/validators";

/**
 * GET /api/documents/[id]/notes?page=...
 * ดึงรายการโน้ตทั้งหมดของเอกสาร (สามารถกรองตามหน้าได้)
 */
export async function GET(request, { params }) {
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

    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page");

    let query = supabase
      .from("notes")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: true });

    if (page) {
      query = query.eq("page_number", parseInt(page, 10));
    }

    const { data: notes, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notes: notes || [] });
  } catch (err) {
    console.error("GET /api/documents/[id]/notes error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/documents/[id]/notes
 * บันทึกโน้ตใหม่ (D, T, H) พร้อม validation ตามข้อกำหนด skill.md
 */
export async function POST(request, { params }) {
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

    // ดึง user_id จาก users table
    const { data: userData } = await supabase
      .from("users")
      .select("user_id")
      .eq("auth_id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const body = await request.json();
    const { note_type, content, page_number, position_x, position_y, color } = body;

    // 1. ตรวจสอบประเภทโน้ต
    if (!["D", "T", "H"].includes(note_type)) {
      return NextResponse.json(
        { error: "note_type ต้องเป็น 'D' (วาด), 'T' (ข้อความ) หรือ 'H' (ไฮไลต์) เท่านั้น" },
        { status: 400 }
      );
    }

    // 2. ตรวจสอบ page_number
    if (!Number.isInteger(page_number) || page_number < 1) {
      return NextResponse.json({ error: "page_number ต้องเป็นจำนวนเต็ม >= 1" }, { status: 400 });
    }

    // 3. ตรวจสอบพิกัดสัมพัทธ์ (0.0 - 1.0)
    if (
      typeof position_x !== "number" ||
      position_x < 0 ||
      position_x > 1 ||
      typeof position_y !== "number" ||
      position_y < 0 ||
      position_y > 1
    ) {
      return NextResponse.json(
        { error: "position_x และ position_y ต้องมีค่าระหว่าง 0.0 ถึง 1.0 (relative)" },
        { status: 400 }
      );
    }

    // 4. Validate content ตาม schema ใน skill.md
    const validation = validateNoteContent(note_type, content);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 5. Insert row ลงตาราง notes
    const { data: newNote, error: insertError } = await supabase
      .from("notes")
      .insert({
        document_id: parseInt(id, 10),
        user_id: userData.user_id,
        note_type,
        content,
        page_number,
        position_x,
        position_y,
        color: color || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert note error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, note: newNote }, { status: 201 });
  } catch (err) {
    console.error("POST /api/documents/[id]/notes error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
