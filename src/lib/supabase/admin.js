import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Admin client — ใช้ service role key
 * สำหรับ admin report functions ที่ต้อง bypass RLS
 * ห้ามใช้ฝั่ง client, ห้ามส่งไป browser
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
