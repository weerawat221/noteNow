import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/folders
 * ดึงรายการโฟลเดอร์ทั้งหมดของผู้ใช้
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: folders, error } = await supabase
      .from("folders")
      .select("folder_id, folder_name, parent_folder_id, created_at")
      .order("folder_name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ folders: folders || [] });
  } catch (err) {
    console.error("GET /api/folders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/folders
 * สร้างโฟลเดอร์ใหม่
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

    const { data: userData } = await supabase
      .from("users")
      .select("user_id")
      .eq("auth_id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const { folder_name, parent_folder_id } = await request.json();

    if (!folder_name || !folder_name.trim()) {
      return NextResponse.json({ error: "กรุณาระบุชื่อโฟลเดอร์" }, { status: 400 });
    }

    const { data: newFolder, error } = await supabase
      .from("folders")
      .insert({
        user_id: userData.user_id,
        folder_name: folder_name.trim(),
        parent_folder_id: parent_folder_id ? parseInt(parent_folder_id, 10) : null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, folder: newFolder }, { status: 201 });
  } catch (err) {
    console.error("POST /api/folders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/folders?id=...
 * ลบโฟลเดอร์ (เอกสารในโฟลเดอร์จะถูกย้ายมาที่ root แทนที่จะถูกลบ)
 */
export async function DELETE(request) {
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
    const folderId = searchParams.get("id");

    if (!folderId) {
      return NextResponse.json({ error: "Missing folder ID" }, { status: 400 });
    }

    // ย้ายเอกสารในโฟลเดอร์นี้ให้ไม่มีโฟลเดอร์ (folder_id = null)
    await supabase
      .from("documents")
      .update({ folder_id: null })
      .eq("folder_id", parseInt(folderId, 10));

    // อัปเดตโฟลเดอร์ย่อยให้ parent_folder_id = null (ขึ้นมาระดับบน)
    await supabase
      .from("folders")
      .update({ parent_folder_id: null })
      .eq("parent_folder_id", parseInt(folderId, 10));

    // ลบโฟลเดอร์
    const { error: deleteError } = await supabase
      .from("folders")
      .delete()
      .eq("folder_id", parseInt(folderId, 10));

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/folders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/folders
 * ย้ายโฟลเดอร์ หรือเปลี่ยนชื่อโฟลเดอร์
 */
export async function PATCH(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { folder_id, parent_folder_id, folder_name } = body;

    if (!folder_id) {
      return NextResponse.json({ error: "Missing folder ID" }, { status: 400 });
    }

    const updates = {};
    if (folder_name !== undefined) {
      updates.folder_name = folder_name.trim();
    }
    if (parent_folder_id !== undefined) {
      const targetParentId = parent_folder_id ? parseInt(parent_folder_id, 10) : null;
      if (targetParentId === parseInt(folder_id, 10)) {
        return NextResponse.json(
          { error: "ไม่สามารถย้ายโฟลเดอร์เข้าไปในตัวเองได้" },
          { status: 400 }
        );
      }
      updates.parent_folder_id = targetParentId;
    }

    const { data: updated, error: updateError } = await supabase
      .from("folders")
      .update(updates)
      .eq("folder_id", parseInt(folder_id, 10))
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, folder: updated });
  } catch (err) {
    console.error("PATCH /api/folders error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

