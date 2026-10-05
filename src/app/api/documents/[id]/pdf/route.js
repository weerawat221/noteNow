import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGoogleToken, getDriveFileStream } from "@/lib/google-drive";

/**
 * GET /api/documents/[id]/pdf
 * สตรีมเนื้อหาไฟล์ PDF จาก Google Drive ผ่านเซิร์ฟเวอร์
 * เพื่อให้ PDF.js ฝั่ง client นำไป render ได้โดยตรง
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
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // ดึง document row เพื่อเอา google_file_id
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("google_file_id, document_name")
      .eq("document_id", id)
      .single();

    if (docError || !doc) {
      return new NextResponse("Document not found", { status: 404 });
    }

    const token = await getValidGoogleToken(user.id);
    if (!token) {
      return new NextResponse("Google Drive authentication required", { status: 403 });
    }

    const driveRes = await getDriveFileStream(token, doc.google_file_id);

    // ส่ง streaming response กลับไปยังเบราว์เซอร์
    return new NextResponse(driveRes.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.document_name)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    console.error("GET /api/documents/[id]/pdf error:", err);
    return new NextResponse("Failed to load PDF from Google Drive", { status: 500 });
  }
}
