import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ตรวจสอบสิทธิ์ผู้ดูแลระบบ (Admin)
 * ต้องเป็น user ที่เข้าสู่ระบบแล้ว และ role = 'A' ในตาราง users
 * และต้องไม่ถูกระงับการใช้งาน (is_suspended = false)
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ", status: 401 };
  }

  const adminClient = createAdminClient();
  const { data: userData, error: userError } = await adminClient
    .from("users")
    .select("user_id, email, first_name, last_name, role, is_suspended, auth_id")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (userError || !userData) {
    return { error: "ไม่พบข้อมูลผู้ใช้ในระบบ", status: 404 };
  }

  if (userData.is_suspended) {
    return { error: "บัญชีของคุณถูกระงับการใช้งาน", status: 403 };
  }

  if (userData.role !== "A") {
    return { error: "ไม่มีสิทธิ์เข้าถึง (เฉพาะผู้ดูแลระบบเท่านั้น)", status: 403 };
  }

  return { user, adminUser: userData, adminClient };
}
