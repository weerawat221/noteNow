import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidGoogleToken, getDriveFileMetadata } from "@/lib/google-drive";

/**
 * ดึง File ID จาก Google Drive URL หรือ ID ธรรมดา
 */
function extractGoogleDriveFileId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  // รูปแบบ /file/d/{id}/
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD) return matchFileD[1];

  // รูปแบบ id={id}
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam) return matchIdParam[1];

  // ถ้าเป็น ID ตรงๆ (ตัวอักษร, ตัวเลข, ขีด, ขีดล่าง ยาว 20 ตัวขึ้นไป)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * POST /api/drive/check-link
 * ตรวจสอบลิงก์ Google Drive และดึง metadata
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

    const { linkOrId } = await request.json();
    const fileId = extractGoogleDriveFileId(linkOrId);

    if (!fileId) {
      return NextResponse.json(
        { error: "รูปแบบลิงก์ Google Drive หรือ File ID ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

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

    const metadata = await getDriveFileMetadata(token, fileId);

    if (metadata.mimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "ไฟล์นี้ไม่ใช่ไฟล์ PDF (ระบบรองรับเฉพาะไฟล์ PDF เท่านั้น)" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      file: {
        id: metadata.id,
        name: metadata.name,
        size: metadata.size ? parseInt(metadata.size, 10) : 0,
        webViewLink: metadata.webViewLink,
      },
    });
  } catch (err) {
    console.error("API /api/drive/check-link error:", err);
    return NextResponse.json(
      { error: err.message || "ไม่สามารถเข้าถึงไฟล์จาก Google Drive ได้" },
      { status: 500 }
    );
  }
}
