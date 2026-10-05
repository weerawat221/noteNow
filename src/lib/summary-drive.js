import "server-only";
import { SUMMARY_CONFIG } from "../config/summary.js";

/**
 * ตรวจสอบ Metadata ของไฟล์จาก Google Drive ก่อนเริ่มดาวน์โหลด
 * 
 * @param {string} googleToken - Google OAuth Access Token
 * @param {string} fileId - Google Drive File ID
 * @param {AbortSignal} [signal] - สำหรับยกเลิกคำขอ
 * @returns {Promise<{ id: string, name: string, size: number, mimeType: string, md5Checksum?: string }>}
 */
export async function validateDriveFile(googleToken, fileId, signal) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType,md5Checksum`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${googleToken}`,
    },
    signal,
  });

  if (res.status === 401) {
    const err = new Error("Google Drive Token หมดอายุ");
    err.code = "DRIVE_AUTH";
    throw err;
  }

  if (res.status === 404) {
    const err = new Error("ไม่พบไฟล์ใน Google Drive");
    err.code = "DRIVE_NOT_FOUND";
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`Google Drive API error (${res.status})`);
    err.code = "UPSTREAM_UNAVAILABLE";
    throw err;
  }

  const meta = await res.json();

  // 1. ตรวจสอบ MimeType
  if (meta.mimeType !== "application/pdf") {
    const err = new Error("ไฟล์ไม่ใช่ PDF");
    err.code = "NOT_A_PDF";
    throw err;
  }

  // 2. ตรวจสอบขนาดไฟล์ก่อนดาวน์โหลด
  const fileSize = Number(meta.size || 0);
  if (fileSize > SUMMARY_CONFIG.MAX_FILE_SIZE_BYTES) {
    const err = new Error(`ขนาดไฟล์ (${(fileSize / (1024 * 1024)).toFixed(1)} MB) เกินเพดานที่ระบบรองรับ`);
    err.code = "FILE_TOO_LARGE";
    throw err;
  }

  return {
    id: meta.id,
    name: meta.name,
    size: fileSize,
    mimeType: meta.mimeType,
    md5Checksum: meta.md5Checksum,
  };
}

/**
 * ดาวน์โหลดเนื้อหาไฟล์ PDF จาก Google Drive เป็น Buffer
 * 
 * @param {string} googleToken 
 * @param {string} fileId 
 * @param {AbortSignal} [signal] 
 * @returns {Promise<Buffer>}
 */
export async function downloadDrivePdfBuffer(googleToken, fileId, signal) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${googleToken}`,
    },
    signal,
  });

  if (res.status === 401) {
    const err = new Error("Google Drive Token หมดอายุ");
    err.code = "DRIVE_AUTH";
    throw err;
  }

  if (res.status === 404) {
    const err = new Error("ไม่พบไฟล์ใน Google Drive");
    err.code = "DRIVE_NOT_FOUND";
    throw err;
  }

  if (!res.ok) {
    const err = new Error(`ดาวน์โหลดไฟล์จาก Google Drive ล้มเหลว (${res.status})`);
    err.code = "UPSTREAM_UNAVAILABLE";
    throw err;
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // ตรวจสอบ Magic bytes ของ PDF (%PDF-)
  if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    const err = new Error("เนื้อหาของไฟล์ไม่ใช่โครงสร้าง PDF ที่สมบูรณ์");
    err.code = "PDF_UNREADABLE";
    throw err;
  }

  return buffer;
}
