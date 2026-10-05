import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGoogleToken, listDrivePdfFiles } from "@/lib/google-drive";

/**
 * GET /api/drive/files?search=...
 * ค้นหาและดึงรายการไฟล์ PDF จาก Google Drive ของผู้ใช้
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
    const search = searchParams.get("search") || "";

    const token = await getValidGoogleToken(user.id);
    if (!token) {
      return NextResponse.json(
        {
          error: "need_reauth",
          message: "ต้องขอสิทธิ์เข้าถึง Google Drive เพิ่มเติม",
        },
        { status: 403 }
      );
    }

    const files = await listDrivePdfFiles(token, search);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("API /api/drive/files error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการดึงไฟล์จาก Google Drive" },
      { status: 500 }
    );
  }
}
