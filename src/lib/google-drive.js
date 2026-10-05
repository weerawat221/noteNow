import { createAdminClient } from "./supabase/admin.js";
import { encrypt, decrypt } from "./crypto.js";

/**
 * ดึง Google Access Token ที่ยังไม่หมดอายุสำหรับ user
 * หากหมดอายุ จะใช้ Refresh Token ขอ Access Token ใหม่ให้อัตโนมัติ
 * และบันทึกกลับลงตาราง users (encrypted)
 */
export async function getValidGoogleToken(authId) {
  const admin = createAdminClient();

  const { data: user, error } = await admin
    .from("users")
    .select("user_id, google_access_token_enc, google_refresh_token_enc, google_token_expires_at")
    .eq("auth_id", authId)
    .single();

  if (error || !user) {
    throw new Error("ไม่พบข้อมูลผู้ใช้ในระบบ");
  }

  if (!user.google_access_token_enc) {
    return null; // ยังไม่ได้เชื่อมต่อ Google Drive
  }

  const now = new Date();
  const expiresAt = user.google_token_expires_at ? new Date(user.google_token_expires_at) : null;

  // หาก token ยังไม่หมดอายุ (เหลือเวลามากกว่า 2 นาที)
  if (expiresAt && expiresAt.getTime() - now.getTime() > 2 * 60 * 1000) {
    return decrypt(user.google_access_token_enc);
  }

  // หากหมดอายุแล้ว แต่มี refresh token ให้ขอใหม่
  if (user.google_refresh_token_enc) {
    try {
      const refreshToken = decrypt(user.google_refresh_token_enc);
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Failed to refresh Google token:", errText);
        // อาจเป็นเพราะ user เพิกถอนสิทธิ์ ให้คืนค่า null เพื่อให้ login ใหม่
        return null;
      }

      const tokenData = await res.json();
      const newAccessToken = tokenData.access_token;
      const expiresInSec = tokenData.expires_in || 3600;
      const newExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

      await admin
        .from("users")
        .update({
          google_access_token_enc: encrypt(newAccessToken),
          google_token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("auth_id", authId);

      return newAccessToken;
    } catch (err) {
      console.error("Error refreshing Google token:", err);
      return null;
    }
  }

  // หากไม่มี refresh token แต่ token เก่ายังมีอยู่ ลอง decrypt ดู
  return decrypt(user.google_access_token_enc);
}

/**
 * ดึงรายการไฟล์ PDF จาก Google Drive ของผู้ใช้
 */
export async function listDrivePdfFiles(accessToken, search = "") {
  let query = "mimeType = 'application/pdf' and trashed = false";
  if (search.trim()) {
    const cleanSearch = search.replace(/'/g, "\\'");
    query += ` and name contains '${cleanSearch}'`;
  }

  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", query);
  url.searchParams.set("fields", "files(id, name, size, mimeType, webViewLink, iconLink, modifiedTime, thumbnailLink)");
  url.searchParams.set("pageSize", "30");
  url.searchParams.set("orderBy", "modifiedTime desc");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * ดึง metadata ของไฟล์เดี่ยวจาก Google Drive
 */
export async function getDriveFileMetadata(accessToken, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,webViewLink,webContentLink`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * สตรีมไฟล์ PDF จาก Google Drive สำหรับ PDF.js และ Gemini
 */
export async function getDriveFileStream(accessToken, fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive download error (${res.status}): ${errText}`);
  }

  return res;
}
