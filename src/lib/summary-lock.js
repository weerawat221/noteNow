import { SUMMARY_CONFIG } from "../config/summary.js";
import { checkRateLimit } from "./rate-limiter.js";

/**
 * Summary Lock Store & Concurrency Manager
 * 
 * หน้าที่:
 * 1. ตรวจสอบ Lock ต่อคู่ (userId, documentId): ป้องกันการกดย้ำหรืองานซ้ำในเอกสารเดียวกัน
 * 2. ตรวจสอบ Global Concurrency Cap: ป้องกันหน่วยความจำและ CPU เซิร์ฟเวอร์ล้น
 * 3. ตรวจสอบ User Rate Limit: จำกัดไม่เกิน 10 ครั้งต่อชั่วโมงต่อผู้ใช้
 * 
 * หมายเหตุสำหรับ Multi-instance / Serverless Deployment:
 * หากแอปพลิเคชันถูก deploy บน Cluster หลายโหนด (เช่น Kubernetes Pods หรือ Serverless Functions)
 * ควรเชื่อมต่อไปยัง Redis (เช่น Redlock หรือ Upstash Redis) เพื่อแชร์ Lock และ Concurrency Counter
 * ผ่าน Interface เดียวกันนี้
 */
class SummaryLockStore {
  constructor() {
    // Map<"userId:documentId", timestamp>
    this.activeJobs = new Map();
    // Set<string>
    this.activeJobIds = new Set();
  }

  /**
   * พยายามจอง Lock สำหรับงานสรุป
   * 
   * @param {string|number} userId 
   * @param {string|number} documentId 
   * @returns {{ success: boolean, reason?: 'BUSY' | 'RATE_LIMITED' | 'GLOBAL_CAP', retryAfter?: number }}
   */
  acquire(userId, documentId) {
    const jobKey = `${userId}:${documentId}`;

    // 1. ตรวจสอบว่าผู้ใช้มีงานสรุปเอกสารนี้กำลังทำงานอยู่หรือไม่
    if (this.activeJobs.has(jobKey)) {
      return {
        success: false,
        reason: "BUSY",
        retryAfter: 15,
      };
    }

    // 2. ตรวจสอบ Global Concurrency Cap
    if (this.activeJobs.size >= SUMMARY_CONFIG.GLOBAL_CONCURRENCY_CAP) {
      return {
        success: false,
        reason: "GLOBAL_CAP",
        retryAfter: 20,
      };
    }

    // 3. ตรวจสอบ Rate Limit ของผู้ใช้ (ไม่เกิน 10 ครั้งต่อชั่วโมง)
    const rateLimitKey = `summary_hourly:${userId}`;
    const rateCheck = checkRateLimit(
      rateLimitKey,
      SUMMARY_CONFIG.USER_RATE_LIMIT_MAX_PER_HOUR,
      SUMMARY_CONFIG.USER_RATE_LIMIT_WINDOW_SECONDS
    );

    if (!rateCheck.allowed) {
      return {
        success: false,
        reason: "RATE_LIMITED",
        retryAfter: rateCheck.retryAfterSeconds,
      };
    }

    // จอง Lock
    this.activeJobs.set(jobKey, Date.now());
    return { success: true };
  }

  /**
   * ปล่อย Lock คืนระบบ
   * 
   * @param {string|number} userId 
   * @param {string|number} documentId 
   */
  release(userId, documentId) {
    const jobKey = `${userId}:${documentId}`;
    this.activeJobs.delete(jobKey);
  }

  /**
   * ดึงจำนวนงานสรุปที่กำลังทำงานอยู่ทั่วทั้งระบบ
   */
  getActiveCount() {
    return this.activeJobs.size;
  }

  /**
   * สำหรับใช้ในการทดสอบ Unit Test
   */
  reset() {
    this.activeJobs.clear();
  }
}

const globalLockStore = globalThis.__notenow_summary_lock || new SummaryLockStore();
if (process.env.NODE_ENV !== "production") {
  globalThis.__notenow_summary_lock = globalLockStore;
}

export { SummaryLockStore };
export const summaryLock = globalLockStore;
