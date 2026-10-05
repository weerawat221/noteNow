import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

/**
 * GET /api/settings/profile
 * ดึงข้อมูลโปรไฟล์ผู้ใช้ปัจจุบัน (ชื่อ, นามสกุล, รูปโปรไฟล์, อีเมล)
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  const admin = createAdminClient();
  const { data: userRow } = await admin
    .from("users")
    .select("user_id, email, first_name, last_name, profile_image, created_at, updated_at")
    .eq("auth_id", user.id)
    .maybeSingle();

  // ดึง fallback จาก user_metadata ของ Google Auth หากในตาราง users ยังว่าง
  const firstName =
    userRow?.first_name ||
    user.user_metadata?.given_name ||
    user.user_metadata?.first_name ||
    (user.user_metadata?.full_name ? user.user_metadata.full_name.split(" ")[0] : "") ||
    "";

  const lastName =
    userRow?.last_name ||
    user.user_metadata?.family_name ||
    user.user_metadata?.last_name ||
    (user.user_metadata?.full_name && user.user_metadata.full_name.split(" ").length > 1
      ? user.user_metadata.full_name.split(" ").slice(1).join(" ")
      : "") ||
    "";

  // ดึงรูปต้นฉบับจาก Google OAuth Identity อย่างแม่นยำ
  let googleAvatarUrl = "";
  try {
    const { data: adminUserData } = await admin.auth.admin.getUserById(user.id);
    const googleIdentity = adminUserData?.user?.identities?.find((i) => i.provider === "google");
    googleAvatarUrl =
      googleIdentity?.identity_data?.avatar_url ||
      googleIdentity?.identity_data?.picture ||
      "";
  } catch (identityErr) {
    console.warn("Could not fetch google identity:", identityErr);
  }

  const profileImage =
    userRow?.profile_image ||
    googleAvatarUrl ||
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    "";

  const email = userRow?.email || user.email || "";

  return NextResponse.json(
    {
      profile: {
        userId: userRow?.user_id,
        email,
        firstName,
        lastName,
        profileImage,
        googleAvatarUrl,
        createdAt: userRow?.created_at,
        updatedAt: userRow?.updated_at,
      },
    },
    { headers: NO_CACHE_HEADERS }
  );
}

/**
 * PUT /api/settings/profile
 * อัปเดตข้อมูลโปรไฟล์ผู้ใช้ (ชื่อ, นามสกุล, อัปโหลดรูปภาพใหม่ หรือเปลี่ยน URL รูปภาพ)
 */
export async function PUT(request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" },
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  const admin = createAdminClient();
  const contentType = request.headers.get("content-type") || "";

  let rawFirstName = "";
  let rawLastName = "";
  let avatarFile = null;
  let customImageUrl = null;
  let resetAvatar = false;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      rawFirstName = formData.get("firstName") ?? formData.get("first_name") ?? "";
      rawLastName = formData.get("lastName") ?? formData.get("last_name") ?? "";
      const fileField = formData.get("avatar") ?? formData.get("profileImage");
      if (fileField && typeof fileField === "object" && fileField.size > 0) {
        avatarFile = fileField;
      }
      customImageUrl = formData.get("profileImageUrl") ?? formData.get("profile_image_url");
      resetAvatar = formData.get("resetAvatar") === "true" || formData.get("reset_avatar") === "true";
    } else {
      const body = await request.json();
      rawFirstName = body.firstName ?? body.first_name ?? "";
      rawLastName = body.lastName ?? body.last_name ?? "";
      customImageUrl = body.profileImageUrl ?? body.profile_image_url ?? null;
      resetAvatar = Boolean(body.resetAvatar || body.reset_avatar);
    }
  } catch (parseError) {
    return NextResponse.json(
      { error: "รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง: " + parseError.message },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // ตรวจสอบความถูกต้องของชื่อ
  const firstName = String(rawFirstName || "").trim();
  const lastName = String(rawLastName || "").trim();

  if (!firstName) {
    return NextResponse.json(
      { error: "กรุณาระบุชื่อของคุณ (ต้องไม่เป็นค่าว่าง)" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  if (firstName.length > 100) {
    return NextResponse.json(
      { error: "ชื่อต้องมีความยาวไม่เกิน 100 ตัวอักษร" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  if (lastName.length > 100) {
    return NextResponse.json(
      { error: "นามสกุลต้องมีความยาวไม่เกิน 100 ตัวอักษร" },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // ดึงข้อมูลแถวเดิมของผู้ใช้
  const { data: currentUserRow } = await admin
    .from("users")
    .select("user_id, profile_image")
    .eq("auth_id", user.id)
    .maybeSingle();

  let newProfileImage = currentUserRow?.profile_image;

  // 1. กรณีผู้ใช้เลือกคืนค่ารูปเดิมเป็นรูปจาก Google
  if (resetAvatar) {
    try {
      const { data: adminUserData } = await admin.auth.admin.getUserById(user.id);
      const googleIdentity = adminUserData?.user?.identities?.find((i) => i.provider === "google");
      newProfileImage =
        googleIdentity?.identity_data?.avatar_url ||
        googleIdentity?.identity_data?.picture ||
        null;
    } catch {
      newProfileImage = null;
    }
  }
  // 2. กรณีผู้ใช้อัปโหลดไฟล์รูปภาพใหม่จากเครื่อง
  else if (avatarFile) {
    if (avatarFile.size > MAX_AVATAR_SIZE_BYTES) {
      return NextResponse.json(
        { error: "ขนาดไฟล์รูปภาพต้องไม่เกิน 2 MB" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(avatarFile.type)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพนามสกุล JPG, PNG, WEBP หรือ GIF เท่านั้น" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // สร้างชื่อไฟล์ที่มี timestamp ป้องกันชื่อซ้ำและ caching
    const ext = avatarFile.name?.split(".").pop() || "png";
    const cleanExt = ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "png";
    const filePath = `${user.id}-${Date.now()}.${cleanExt}`;

    const arrayBuffer = await avatarFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // อัปโหลดขึ้น Supabase Storage บักเก็ต avatars
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(filePath, buffer, {
        contentType: avatarFile.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "ไม่สามารถอัปโหลดรูปภาพได้: " + uploadError.message },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("avatars").getPublicUrl(filePath);

    newProfileImage = publicUrl;
  }
  // 3. กรณีผู้ใช้ระบุ URL ของรูปภาพเองโดยตรง
  else if (typeof customImageUrl === "string" && customImageUrl.trim().length > 0) {
    const trimmedUrl = customImageUrl.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      return NextResponse.json(
        { error: "URL ของรูปภาพต้องขึ้นต้นด้วย http:// หรือ https://" },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }
    newProfileImage = trimmedUrl;
  }

  // อัปเดตข้อมูลลงตาราง public.users
  const updates = {
    first_name: firstName,
    last_name: lastName,
    updated_at: new Date().toISOString(),
  };

  if (newProfileImage !== undefined) {
    updates.profile_image = newProfileImage;
  }

  const { error: updateDbError } = await admin
    .from("users")
    .update(updates)
    .eq("auth_id", user.id);

  if (updateDbError) {
    console.error("Database user update error:", updateDbError);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูล: " + updateDbError.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }

  // อัปเดตข้อมูล user_metadata ใน Supabase Auth ให้สอดคล้องกันแบบเรียลไทม์
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  try {
    const authMetadata = {
      first_name: firstName,
      last_name: lastName,
      given_name: firstName,
      family_name: lastName,
      full_name: fullName,
    };
    if (newProfileImage) {
      authMetadata.avatar_url = newProfileImage;
      authMetadata.picture = newProfileImage;
    }
    await supabase.auth.updateUser({
      data: authMetadata,
    });
  } catch (authMetaErr) {
    console.warn("Could not update auth user_metadata:", authMetaErr);
  }

  return NextResponse.json(
    {
      success: true,
      message: "บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว",
      profile: {
        firstName,
        lastName,
        fullName,
        profileImage: newProfileImage,
        email: user.email,
      },
    },
    { headers: NO_CACHE_HEADERS }
  );
}
