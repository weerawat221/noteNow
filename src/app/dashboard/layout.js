import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";

/**
 * Dashboard Layout — sidebar + main content area
 * ตรวจสอบ auth ก่อนแสดง
 */
export default async function DashboardLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ดึงข้อมูลโปรไฟล์ล่าสุด (ชื่อ นามสกุล รูปโปรไฟล์, role, สถานะระงับ) จากตาราง users
  const { data: userProfile } = await supabase
    .from("users")
    .select("user_id, first_name, last_name, profile_image, role, is_suspended")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (userProfile?.is_suspended) {
    await supabase.auth.signOut();
    redirect("/login?error=suspended");
  }

  const enrichedUser = {
    ...user,
    user_id: userProfile?.user_id,
    role: userProfile?.role || "U",
    is_suspended: Boolean(userProfile?.is_suspended),
    first_name: userProfile?.first_name || user?.user_metadata?.first_name || user?.user_metadata?.given_name,
    last_name: userProfile?.last_name || user?.user_metadata?.last_name || user?.user_metadata?.family_name,
    profile_image:
      userProfile?.profile_image ||
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture,
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden">
      <Sidebar user={enrichedUser} />
      <main className="flex-1 overflow-y-auto bg-gray-50 min-w-0">
        {children}
      </main>
    </div>
  );
}
