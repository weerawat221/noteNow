import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * สร้าง Supabase client สำหรับใช้ฝั่ง server (Server Components, Route Handlers, Server Actions)
 * ใช้ anon key + cookie-based auth — ข้อมูลถูกจำกัดด้วย RLS
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail in Server Components (read-only cookies)
            // This is fine — cookies will be set in middleware instead
          }
        },
      },
    }
  );
}
