/**
 * Rate Limiter แบบ In-Memory Sliding Window
 * 
 * ข้อควรทราบสำหรับ Production / Serverless:
 * ในสภาวะ Multi-instance, Serverless (เช่น Vercel, AWS Lambda) หรือ Kubernetes Pods หลายตัว
 * In-Memory Map จะแยกตาม instance/process หากต้องการ Rate Limiting ที่แม่นยำ 100% ข้ามเครื่อง
 * สามารถสลับไปใช้ Distributed Store เช่น Redis (Upstash, Redis Cloud) หรือ PostgreSQL Table
 * โดยคงอินเทอร์เฟซ checkRateLimit(key, maxRequests, windowMs) เดิมไว้
 */
class InMemoryRateLimiter {
  constructor() {
    this.storage = new Map();

    // ล้างข้อมูลเก่าเป็นระยะเพื่อไม่ให้ memory บวม
    if (typeof setInterval !== "undefined") {
      const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, timestamps] of this.storage.entries()) {
          const valid = timestamps.filter((t) => now - t < 3600000); // เก็บไว้ไม่เกิน 1 ชม.
          if (valid.length === 0) {
            this.storage.delete(key);
          } else {
            this.storage.set(key, valid);
          }
        }
      }, 300000); // ทุก 5 นาที

      if (cleanupInterval.unref) {
        cleanupInterval.unref();
      }
    }
  }

  /**
   * ตรวจสอบว่าคำขอนี้ได้รับอนุญาตหรือไม่
   * 
   * @param {string} key - ตัวระบุ เช่น `gemini_put:${userId}`
   * @param {number} maxRequests - จำนวนคำขอสูงสุดที่อนุญาตในกรอบเวลา
   * @param {number} windowMs - ขนาดของกรอบเวลาในระดับมิลลิวินาที (เช่น 10 นาที = 600000 ms)
   * @returns {{ allowed: boolean, retryAfterSeconds: number, remaining: number }}
   */
  check(key, maxRequests, windowMs) {
    const now = Date.now();
    const timestamps = this.storage.get(key) || [];

    // กรองเอาเฉพาะ timestamp ที่ยังอยู่ใน window
    const windowStart = now - windowMs;
    const activeTimestamps = timestamps.filter((t) => t > windowStart);

    if (activeTimestamps.length >= maxRequests) {
      const oldestInWindow = activeTimestamps[0];
      const resetTime = oldestInWindow + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));

      return {
        allowed: false,
        retryAfterSeconds,
        remaining: 0,
      };
    }

    activeTimestamps.push(now);
    this.storage.set(key, activeTimestamps);

    return {
      allowed: true,
      retryAfterSeconds: 0,
      remaining: maxRequests - activeTimestamps.length,
    };
  }

  /**
   * สำหรับใช้ในการทดสอบ (Reset state)
   */
  reset() {
    this.storage.clear();
  }
}

// Global Singleton Instance สำหรับแอปพลิเคชัน
const globalLimiter = globalThis.__notenow_rate_limiter || new InMemoryRateLimiter();
if (process.env.NODE_ENV !== "production") {
  globalThis.__notenow_rate_limiter = globalLimiter;
}

/**
 * Helper ฟังก์ชันสำหรับตรวจสอบโควต้าคำขอ
 */
export function checkRateLimit(key, maxRequests, windowSeconds) {
  return globalLimiter.check(key, maxRequests, windowSeconds * 1000);
}

export { InMemoryRateLimiter };
