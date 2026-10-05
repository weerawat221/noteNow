import "server-only";
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const KEY_LENGTH = 32; // 256 bits

/**
 * โครงสร้างการจัดการ Master Keys สำหรับเข้ารหัสลับ:
 * - ตัวแปรแวดล้อม KEY_ENCRYPTION_KEYS เก็บในรูปแบบ: "v1:<base64-32-bytes>,v2:<base64-32-bytes>"
 * - คีย์เวอร์ชันแรกสุดหรือเวอร์ชันที่ระบุจะถูกใช้เป็น Active Key สำหรับการเข้ารหัสใหม่
 * - รองรับ fallback ไปยัง ENCRYPTION_KEY เพื่อ backward compatibility กับโปรเจคเดิม
 */
function loadMasterKeys() {
  const envKeys = process.env.KEY_ENCRYPTION_KEYS;
  const legacyHexKey = process.env.ENCRYPTION_KEY;

  const keyMap = new Map();
  let defaultVersion = null;

  if (envKeys && typeof envKeys === "string" && envKeys.trim().length > 0) {
    const pairs = envKeys.split(",").map((s) => s.trim()).filter(Boolean);
    for (const pair of pairs) {
      const match = pair.match(/^([a-zA-Z0-9_-]+):([A-Za-z0-9+/=]+)$/);
      if (!match) {
        throw new Error(
          `[secrets] รูปแบบ KEY_ENCRYPTION_KEYS ไม่ถูกต้อง: ต้องเป็น 'version:base64Key' (พบ: ${pair.slice(0, 10)}...)`
        );
      }
      const [, version, b64] = match;
      const buf = Buffer.from(b64, "base64");
      if (buf.length !== KEY_LENGTH) {
        throw new Error(
          `[secrets] Master key เวอร์ชัน ${version} ต้องมีความยาว 32 bytes (256 bits) แต่ได้ ${buf.length} bytes`
        );
      }
      keyMap.set(version, buf);
      if (!defaultVersion) {
        defaultVersion = version;
      }
    }
  }

  // Fallback สำหรับ legacy ENCRYPTION_KEY (hex 64 chars = 32 bytes)
  if (keyMap.size === 0 && legacyHexKey && legacyHexKey.length === 64) {
    const legacyBuf = Buffer.from(legacyHexKey, "hex");
    if (legacyBuf.length === KEY_LENGTH) {
      keyMap.set("v1", legacyBuf);
      defaultVersion = "v1";
    }
  }

  if (keyMap.size === 0 || !defaultVersion) {
    throw new Error(
      "[secrets] ไม่พบ Master Key ใน environment: กรุณากำหนด KEY_ENCRYPTION_KEYS='v1:<base64 32 bytes>'"
    );
  }

  return { keyMap, defaultVersion };
}

let cachedKeys = null;
function getKeys() {
  if (!cachedKeys) {
    cachedKeys = loadMasterKeys();
  }
  return cachedKeys;
}

/**
 * เข้ารหัสข้อมูลลับด้วย AES-256-GCM พร้อมผูก AAD (Additional Authenticated Data)
 * 
 * @param {string} plaintext - ข้อมูลดิบที่ต้องการเข้ารหัส (เช่น API Key)
 * @param {object} context
 * @param {string|number} context.userId - รหัสผู้ใช้เพื่อใช้เป็น AAD ป้องกันการสลับ ciphertext ข้ามผู้ใช้
 * @returns {string} - รูปแบบ "v1:<iv base64>:<tag base64>:<ciphertext base64>"
 */
export function encryptSecret(plaintext, { userId }) {
  if (typeof plaintext !== "string" || !plaintext) {
    throw new Error("[secrets] plaintext ต้องเป็น string ที่ไม่ว่างเปล่า");
  }
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error("[secrets] userId จำเป็นสำหรับการผูก AAD เพื่อความปลอดภัย");
  }

  const { keyMap, defaultVersion } = getKeys();
  const masterKey = keyMap.get(defaultVersion);
  if (!masterKey) {
    throw new Error(`[secrets] ไม่พบคีย์สำหรับเวอร์ชัน ${defaultVersion}`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);

  // กำหนด AAD ด้วย userId: หากมีใครสลับ ciphertext ไปใส่แถวของผู้ใช้อื่น การถอดรหัสจะล้มเหลวทันที
  cipher.setAAD(Buffer.from(String(userId), "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${defaultVersion}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * ถอดรหัสข้อมูลลับด้วย AES-256-GCM พร้อมตรวจสอบ AAD (userId)
 * 
 * @param {string} payload - รูปแบบ "version:iv:tag:ciphertext"
 * @param {object} context
 * @param {string|number} context.userId - รหัสผู้ใช้ที่ตรงกับตอนเข้ารหัส
 * @returns {string} - Plaintext ที่ถอดรหัสแล้ว
 */
export function decryptSecret(payload, context) {
  if (typeof payload !== "string" || !payload) {
    throw new Error("[secrets] payload ต้องเป็น string");
  }
  const userId = context && typeof context === "object" ? context.userId : context;
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error("[secrets] userId จำเป็นสำหรับการตรวจสอบ AAD");
  }

  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("[secrets] รูปแบบ payload ไม่ถูกต้อง (ต้องการ version:iv:tag:ciphertext)");
  }

  const [version, ivB64, tagB64, cipherB64] = parts;
  const { keyMap } = getKeys();
  const masterKey = keyMap.get(version);

  if (!masterKey) {
    throw new Error(`[secrets] ไม่พบ Master Key เวอร์ชัน '${version}' ในระบบ`);
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(cipherB64, "base64");

  if (iv.length !== IV_LENGTH) {
    throw new Error("[secrets] ความยาว IV ไม่ถูกต้อง");
  }
  if (authTag.length !== TAG_LENGTH) {
    throw new Error("[secrets] ความยาว Authentication Tag ไม่ถูกต้อง");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(String(userId), "utf8"));

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (err) {
    // ป้องกันการรั่วไหลของรายละเอียด cryptographic สู่ภายนอก
    throw new Error("[secrets] การถอดรหัสล้มเหลว: ข้อมูลถูกดัดแปลงหรือเจ้าของข้อมูลไม่ถูกต้อง");
  }
}

/**
 * =========================================================================
 * หมายเหตุความปลอดภัยและการปฏิบัติการ (Security & Operational Notes):
 * =========================================================================
 * 
 * 1. ผลกระทบกรณี Master Key สูญหาย (Master Key Loss):
 *    เนื่องจาก AES-256-GCM เป็นการเข้ารหัสแบบสมมาตรที่ปลอดภัยระดับมาตรฐานสากล
 *    หาก Master Key ใน environment สูญหาย ข้อมูลในคอลัมน์ gemini_api_key_enc ทั้งหมด
 *    จะไม่สามารถถอดรหัสได้ตลอดไป (Unrecoverable) ผู้ใช้จะต้องกรอก API Key ใหม่ด้วยตนเอง
 *    ดังนั้นควรสำรอง Master Key ใน Secret Manager / Vault ที่ปลอดภัย
 * 
 * 2. ขั้นตอนการหมุน Master Key (Key Rotation):
 *    - สร้าง Key 32 bytes ใหม่ใน base64
 *    - อัปเดต KEY_ENCRYPTION_KEYS ให้มีทั้งเวอร์ชันใหม่และเก่า โดยเอาเวอร์ชันใหม่ขึ้นต้น เช่น:
 *      KEY_ENCRYPTION_KEYS="v2:<new_key_b64>,v1:<old_key_b64>"
 *    - ระบบจะใช้ v2 ในการเข้ารหัสใหม่ทันที และยังสามารถถอดรหัส v1 ของผู้ใช้เดิมได้
 *    - รันคำสั่ง/สคริปต์ Migration ทำการวนลูปอ่านแถวที่มี prefix "v1:", ถอดรหัสด้วย v1,
 *      เข้ารหัสใหม่ด้วย v2 (ซึ่งเรียก encryptSecret ตามปกติ), แล้วบันทึกกลับลงตาราง
 *    - เมื่อทุกแถวกลายเป็น "v2:" ทั้งหมด สามารถลบ "v1:..." ออกจาก environment ได้อย่างปลอดภัย
 * 
 * 3. การเปลี่ยนไปใช้ Supabase Vault ในอนาคต:
 *    ฟังก์ชัน encryptSecret และ decryptSecret ถูกออกแบบให้อยู่ในโมดูลเดียว
 *    หากต้องการย้ายไปใช้ Supabase Vault (pgsodium) สามารถเขียน implementation ภายในให้เรียก
 *    vault.create_secret() และ vault.decrypted_secrets ได้ทันที
 *    โดยที่ signature และ interface ของทั้งสองฟังก์ชันคงเดิม ไม่กระทบกับ Service อื่นในระบบ
 */
