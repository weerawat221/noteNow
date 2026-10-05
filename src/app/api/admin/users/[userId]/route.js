import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/users/[userId]
 * แก้ไขข้อมูลส่วนตัวผู้ใช้ (ชื่อ, นามสกุล, รูปโปรไฟล์) หรือระงับ/ยกเลิกระงับการใช้งาน
 */
export async function PATCH(request, { params }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { userId } = await params;
    const targetUserId = parseInt(userId, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      return NextResponse.json({ error: "รหัสผู้ใช้ไม่ถูกต้อง" }, { status: 400 });
    }

    const { adminClient, adminUser } = auth;

    // ตรวจสอบว่ามีผู้ใช้นี้อยู่จริงหรือไม่
    const { data: targetUser, error: findError } = await adminClient
      .from("users")
      .select("user_id, role, is_suspended, email")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (findError || !targetUser) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้ที่ระบุ" }, { status: 404 });
    }

    const body = await request.json();
    const updates = {
      updated_at: new Date().toISOString(),
    };

    if (body.first_name !== undefined) {
      const fn = String(body.first_name).trim();
      if (!fn) {
        return NextResponse.json({ error: "กรุณาระบุชื่อ (ห้ามเว้นว่าง)" }, { status: 400 });
      }
      if (fn.length > 100) {
        return NextResponse.json({ error: "ชื่อต้องยาวไม่เกิน 100 ตัวอักษร" }, { status: 400 });
      }
      updates.first_name = fn;
    }

    if (body.last_name !== undefined) {
      const ln = String(body.last_name).trim();
      if (ln.length > 100) {
        return NextResponse.json({ error: "นามสกุลต้องยาวไม่เกิน 100 ตัวอักษร" }, { status: 400 });
      }
      updates.last_name = ln;
    }

    if (body.profile_image !== undefined) {
      updates.profile_image = body.profile_image || null;
    }

    if (typeof body.is_suspended === "boolean") {
      // ป้องกันแอดมินระงับตัวเอง
      if (targetUser.user_id === adminUser.user_id && body.is_suspended) {
        return NextResponse.json(
          { error: "คุณไม่สามารถระงับการใช้งานบัญชีของตนเองได้" },
          { status: 400 }
        );
      }
      updates.is_suspended = body.is_suspended;
    }

    const { data: updated, error: updateError } = await adminClient
      .from("users")
      .update(updates)
      .eq("user_id", targetUserId)
      .select("user_id, email, first_name, last_name, profile_image, role, is_suspended, updated_at")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      user: updated,
      message: updates.is_suspended !== undefined
        ? updates.is_suspended
          ? "ระงับการใช้งานผู้ใช้เรียบร้อยแล้ว"
          : "ยกเลิกการระงับการใช้งานเรียบร้อยแล้ว"
        : "อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("PATCH /api/admin/users/[userId] error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้" },
      { status: 500 }
    );
  }
}
