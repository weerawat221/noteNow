import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Admin Layout Guard
 * บังคับให้เฉพาะผู้ใช้ที่มี role = 'A' เท่านั้นที่สามารถเข้าถึงกลุ่มหน้า /dashboard/admin/*
 */
export default async function AdminLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: userProfile } = await supabase
    .from("users")
    .select("role, is_suspended")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (userProfile?.is_suspended) {
    await supabase.auth.signOut();
    redirect("/login?error=suspended");
  }

  if (userProfile?.role !== "A") {
    redirect("/dashboard");
  }

  return children;
}
