import { createBrowserClient } from "@supabase/ssr";

/**
 * สร้าง Supabase client สำหรับใช้ฝั่ง browser (Client Components)
 * ใช้ anon key เท่านั้น — ข้อมูลถูกจำกัดด้วย RLS
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
