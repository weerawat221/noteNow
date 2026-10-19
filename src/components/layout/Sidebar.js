"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const studentNavItems = [
  {
    label: "แดชบอร์ด",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: "เอกสาร",
    href: "/dashboard/documents",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },

  {
    label: "ตั้งค่า",
    href: "/dashboard/settings",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const adminNavItems = [
  {
    label: "แดชบอร์ดสถิติ",
    href: "/dashboard",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: "จัดการผู้ใช้",
    href: "/dashboard/admin/users",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    label: "จัดการเอกสาร",
    href: "/dashboard/admin/documents",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
      </svg>
    ),
  },
  {
    label: "ตั้งค่า",
    href: "/dashboard/settings",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Sidebar({ user }) {
  const pathname = usePathname();
  const router = useRouter();
  const [imageError, setImageError] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const avatarUrl = user?.profile_image || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.user_metadata?.full_name ||
    user?.email;

  useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  // ปิด mobile drawer อัตโนมัติเมื่อเปลี่ยนหน้า
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ปิด mobile drawer เมื่อกดปุ่ม Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ซ่อน Sidebar ในหน้าจดบันทึกเอกสารเพื่อให้มีพื้นที่เต็มจอสำหรับ PDF & Canvas
  const isDocumentEditor = pathname.startsWith("/dashboard/documents/") && pathname !== "/dashboard/documents";
  if (isDocumentEditor) {
    return null;
  }

  const navItems = user?.role === "A" ? adminNavItems : studentNavItems;

  const renderNavContent = (isMobileDrawer = false) => (
    <>
      {/* Logo & Header */}
      <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between">
        <Link
          href="/dashboard"
          className="flex items-center gap-3"
          onClick={() => isMobileDrawer && setMobileOpen(false)}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0"
            style={{ background: "linear-gradient(135deg, #818cf8, #6366f1)" }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <span className="text-white font-semibold text-lg leading-tight block">NoteNow</span>
            {user?.role === "A" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                🛡️ ผู้ดูแลระบบ
              </span>
            )}
          </div>
        </Link>
        {isMobileDrawer && (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="ปิดเมนู"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobileDrawer && setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-gray-300 hover:bg-white/8 hover:text-white"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          {avatarUrl && !imageError ? (
            <img
              src={avatarUrl}
              alt="avatar"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="w-8 h-8 rounded-full object-cover border border-white/20 shadow-xs shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold border border-white/20 shadow-xs shrink-0">
              {fullName?.[0]?.toUpperCase() ||
                user?.email?.[0]?.toUpperCase() ||
                "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-white text-sm font-medium truncate">
                {fullName}
              </p>
              {user?.role === "A" && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 shrink-0">
                  ADMIN
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-all duration-200 cursor-pointer"
          id="btn-logout"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          ออกจากระบบ
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile / Tablet Top Navigation Header (visible only on < lg) */}
      <header
        className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 z-30"
        style={{ background: "var(--surface-sidebar)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-gray-200 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            aria-label="เปิดเมนูนำทาง"
            id="btn-mobile-menu-toggle"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/dashboard" className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shadow-xs"
              style={{ background: "linear-gradient(135deg, #818cf8, #6366f1)" }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-white font-semibold text-base">NoteNow</span>
            {user?.role === "A" && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                ADMIN
              </span>
            )}
          </Link>
        </div>

        {/* User Mini Avatar on Mobile Topbar */}
        <Link href="/dashboard/settings" className="flex items-center gap-2">
          {avatarUrl && !imageError ? (
            <img
              src={avatarUrl}
              alt="avatar"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="w-7 h-7 rounded-full object-cover border border-white/20 shadow-xs shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold border border-white/20 shadow-xs shrink-0">
              {fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
            </div>
          )}
        </Link>
      </header>

      {/* Mobile Drawer Backdrop & Slide-over Navigation (< lg) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sidebar */}
          <aside
            className="fixed inset-y-0 left-0 w-72 max-w-[85vw] flex flex-col h-full shadow-2xl z-50 animate-slide-left"
            style={{ background: "var(--surface-sidebar)" }}
            role="dialog"
            aria-modal="true"
            aria-label="เมนูนำทางหลัก"
          >
            {renderNavContent(true)}
          </aside>
        </div>
      )}

      {/* Desktop Docked Sidebar (>= lg) */}
      <aside
        className="hidden lg:flex w-64 flex-col h-full shrink-0"
        style={{ background: "var(--surface-sidebar)" }}
      >
        {renderNavContent(false)}
      </aside>
    </>
  );
}
