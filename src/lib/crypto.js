import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16;

/**
 * ดึง encryption key จาก environment variable
 * Key ต้องเป็น hex string ความยาว 64 chars (256 bits)
 */
function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY ต้องเป็น hex string 64 ตัวอักษร (256 bits)"
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * เข้ารหัสข้อมูล (plaintext → ciphertext)
 * ผลลัพธ์: base64 string ที่รวม iv + ciphertext + authTag
 * @param {string} plaintext - ข้อมูลที่ต้องการเข้ารหัส
 * @returns {string} - encrypted base64 string
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // รวม iv + authTag + ciphertext เป็น base64 string เดียว
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, "hex"),
  ]);

  return combined.toString("base64");
}

/**
 * ถอดรหัสข้อมูล (ciphertext → plaintext)
 * @param {string} encryptedBase64 - base64 string จาก encrypt()
 * @returns {string} - ข้อมูลเดิม
 */
export function decrypt(encryptedBase64) {
  const key = getKey();
  const combined = Buffer.from(encryptedBase64, "base64");

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
