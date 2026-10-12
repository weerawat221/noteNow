"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

/**
 * หน้าตั้งค่า (Settings)
 * 1. ข้อมูลส่วนตัว (Personal Profile): เปลี่ยนชื่อ, นามสกุล, และรูปโปรไฟล์
 * 2. ความปลอดภัย Gemini API Key: จัดการ เข้ารหัส ทดสอบ เปลี่ยน และลบ API Key
 */
export default function SettingsPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  // ----------------------------------------------------
  // PROFILE STATES
  // ----------------------------------------------------
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [initialProfile, setInitialProfile] = useState({
    firstName: "",
    lastName: "",
    profileImage: "",
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarError, setAvatarError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [resetToDefaultAvatar, setResetToDefaultAvatar] = useState(false);
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState("");
  const [profileNotification, setProfileNotification] = useState(null);

  // ----------------------------------------------------
  // GEMINI KEY STATES
  // ----------------------------------------------------
  const [hasKey, setHasKey] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [showApiKeyGuide, setShowApiKeyGuide] = useState(false);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Testing states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { status, message }

  // Deletion modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notifications (Alerts for Key)
  const [notification, setNotification] = useState(null); // { type: 'success'|'warning'|'error', text: '' }

  useEffect(() => {
    setMounted(true);
    fetchProfile();
    fetchKeyStatus();
  }, []);

  // Cleanup object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  // ----------------------------------------------------
  // PROFILE HANDLERS
  // ----------------------------------------------------
  async function fetchProfile() {
    setProfileLoading(true);
    try {
      const res = await fetch("/api/settings/profile", {
        headers: { "Cache-Control": "no-store" },
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.profile || {};
        const fName = p.firstName || "";
        const lName = p.lastName || "";
        const img = p.profileImage || "";
        setFirstName(fName);
        setLastName(lName);
        setEmail(p.email || "");
        setProfileImage(img);
        setGoogleAvatarUrl(p.googleAvatarUrl || "");
        setInitialProfile({
          firstName: fName,
          lastName: lName,
          profileImage: img,
        });
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
    } finally {
      setProfileLoading(false);
    }
  }

  function handleAvatarFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setProfileNotification({
        type: "error",
        text: "ไฟล์รูปภาพต้องมีขนาดไม่เกิน 2 MB",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Validate type
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setProfileNotification({
        type: "error",
        text: "รองรับเฉพาะไฟล์รูปภาพนามสกุล JPG, PNG, WEBP หรือ GIF เท่านั้น",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Clear previous preview blob if exists
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    setResetToDefaultAvatar(false);
    setAvatarError(false);
    setShowUrlInput(false);
    setCustomUrlInput("");
    setAvatarPreview(URL.createObjectURL(file));
    setProfileNotification(null);
  }

  function handleResetToGoogleAvatar() {
    if (!googleAvatarUrl) {
      setProfileNotification({
        type: "warning",
        text: "ไม่พบรูปโปรไฟล์จาก Google หรือบัญชีไม่ได้เชื่อมต่อผ่าน Google",
      });
      return;
    }

    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setResetToDefaultAvatar(true);
    setShowUrlInput(false);
    setCustomUrlInput("");
    setAvatarError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // แสดงพรีวิวรูป Google ทันที
    setAvatarPreview(googleAvatarUrl);
    setProfileNotification({
      type: "warning",
      text: "เลือกใช้รูปโปรไฟล์จาก Google แล้ว — กรุณากดปุ่ม 'บันทึกข้อมูลส่วนตัว' เพื่อยืนยันการเปลี่ยนแปลง",
    });
  }

  function handleApplyCustomUrl(e) {
    e.preventDefault();
    if (!customUrlInput.trim()) return;
    if (!/^https?:\/\//i.test(customUrlInput.trim())) {
      setProfileNotification({
        type: "error",
        text: "URL รูปภาพต้องขึ้นต้นด้วย http:// หรือ https://",
      });
      return;
    }
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(null);
    setAvatarPreview(customUrlInput.trim());
    setResetToDefaultAvatar(false);
    setAvatarError(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setProfileNotification(null);
  }

  function handleDiscardProfileChanges() {
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }
    setFirstName(initialProfile.firstName);
    setLastName(initialProfile.lastName);
    setAvatarFile(null);
    setAvatarPreview(null);
    setResetToDefaultAvatar(false);
    setShowUrlInput(false);
    setCustomUrlInput("");
    setAvatarError(false);
    setProfileNotification(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst) {
      setProfileNotification({
        type: "error",
        text: "กรุณาระบุชื่อของคุณ (ต้องไม่เป็นค่าว่าง)",
      });
      return;
    }

    setProfileSubmitting(true);
    setProfileNotification(null);

    try {
      const formData = new FormData();
      formData.append("firstName", trimmedFirst);
      formData.append("lastName", trimmedLast);

      if (resetToDefaultAvatar) {
        formData.append("resetAvatar", "true");
      } else if (avatarFile) {
        formData.append("avatar", avatarFile);
      } else if (customUrlInput.trim()) {
        formData.append("profileImageUrl", customUrlInput.trim());
      }

      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Cache-Control": "no-store" },
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        const updated = data.profile || {};
        const newFirst = updated.firstName || trimmedFirst;
        const newLast = updated.lastName || trimmedLast;
        const newImg = updated.profileImage || "";

        setFirstName(newFirst);
        setLastName(newLast);
        setProfileImage(newImg);
        setInitialProfile({
          firstName: newFirst,
          lastName: newLast,
          profileImage: newImg,
        });

        if (avatarPreview && avatarPreview.startsWith("blob:")) {
          URL.revokeObjectURL(avatarPreview);
        }
        setAvatarFile(null);
        setAvatarPreview(null);
        setResetToDefaultAvatar(false);
        setShowUrlInput(false);
        setCustomUrlInput("");
        setAvatarError(false);
        if (fileInputRef.current) fileInputRef.current.value = "";

        setProfileNotification({
          type: "success",
          text: data.message || "บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว",
        });

        // สั่งให้ Next.js รีเฟรช Server Components เพื่อให้ Sidebar อัปเดตรูปและชื่อทันที
        router.refresh();
      } else {
        setProfileNotification({
          type: "error",
          text: data.error || "ไม่สามารถบันทึกข้อมูลส่วนตัวได้",
        });
      }
    } catch {
      setProfileNotification({
        type: "error",
        text: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setProfileSubmitting(false);
    }
  }

  const isProfileDirty =
    firstName.trim() !== initialProfile.firstName ||
    lastName.trim() !== initialProfile.lastName ||
    avatarFile !== null ||
    resetToDefaultAvatar ||
    Boolean(customUrlInput.trim());

  const currentDisplayAvatar =
    avatarPreview !== null ? avatarPreview : profileImage;

  // ----------------------------------------------------
  // GEMINI KEY HANDLERS
  // ----------------------------------------------------
  async function fetchKeyStatus() {
    setLoadingStatus(true);
    try {
      const res = await fetch("/api/settings/gemini-key", {
        headers: { "Cache-Control": "no-store" },
      });
      const data = await res.json();
      if (res.ok) {
        setHasKey(Boolean(data.hasKey));
      } else {
        setHasKey(false);
      }
    } catch {
      setHasKey(false);
    } finally {
      setLoadingStatus(false);
    }
  }

  // ส่งบันทึก / เปลี่ยน API Key
  async function handleSaveKey(e) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setIsSubmitting(true);
    setNotification(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings/gemini-key", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setHasKey(true);
        // ล้างค่าใน state ทันทีหลังสำเร็จเพื่อความปลอดภัย
        setApiKeyInput("");
        setShowPasswordText(false);
        setShowForm(false);

        if (data.warning) {
          setNotification({
            type: "warning",
            text: data.warning,
          });
        } else {
          setNotification({
            type: "success",
            text: "บันทึกและเข้ารหัส Gemini API Key สำเร็จ พร้อมใช้งาน",
          });
        }
      } else {
        setNotification({
          type: "error",
          text: data.error || "ไม่สามารถบันทึก API Key ได้ กรุณาตรวจสอบข้อมูล",
        });
      }
    } catch {
      setNotification({
        type: "error",
        text: "เกิดข้อผิดพลาดในการเชื่อมต่อไปยังเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // กดปุ่มทดสอบ Key ที่บันทึกไว้
  async function handleTestKey() {
    setIsTesting(true);
    setTestResult(null);
    setNotification(null);

    try {
      const res = await fetch("/api/settings/gemini-key/test", {
        method: "POST",
        headers: { "Cache-Control": "no-store" },
      });

      const data = await res.json();

      if (res.ok) {
        setTestResult({
          status: data.status,
          message: data.message,
        });
      } else if (res.status === 404) {
        setHasKey(false);
        setNotification({
          type: "error",
          text: "ไม่พบ Key ในระบบ กรุณาบันทึก Key ใหม่",
        });
      } else if (res.status === 429) {
        setNotification({
          type: "error",
          text: data.error || "คุณทดสอบบ่อยเกินไป กรุณารอสักครู่",
        });
      } else {
        setTestResult({
          status: "invalid",
          message: data.error || "ไม่สามารถทดสอบ Key ได้",
        });
      }
    } catch {
      setTestResult({
        status: "unreachable",
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ขณะทดสอบ",
      });
    } finally {
      setIsTesting(false);
    }
  }

  // ยืนยันการลบ Key
  async function handleConfirmDelete() {
    setIsDeleting(true);
    setNotification(null);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings/gemini-key", {
        method: "DELETE",
        headers: { "Cache-Control": "no-store" },
      });

      if (res.ok) {
        setHasKey(false);
        setShowDeleteModal(false);
        setShowForm(false);
        setApiKeyInput("");
        setNotification({
          type: "success",
          text: "ลบ Gemini API Key ออกจากระบบเรียบร้อยแล้ว (สรุปเนื้อหาเดิมยังคงอยู่)",
        });
      } else {
        const data = await res.json();
        setNotification({
          type: "error",
          text: data.error || "ไม่สามารถลบ API Key ได้",
        });
      }
    } catch {
      setNotification({
        type: "error",
        text: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 animate-fade-in max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">ตั้งค่า</h1>
        <p className="text-gray-500 mt-1 text-sm">
          จัดการข้อมูลส่วนตัวของผู้ใช้ และการเชื่อมต่อ Gemini API สำหรับการสรุปเนื้อหาเอกสาร
        </p>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: ข้อมูลส่วนตัวผู้ใช้ (USER PROFILE)                              */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-gray-100 flex items-center gap-3.5 bg-gradient-to-r from-indigo-50/50 via-white to-transparent">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">ข้อมูลส่วนตัว</h2>
            <p className="text-xs text-gray-500">
              แก้ไขชื่อ นามสกุล และรูปโปรไฟล์ของคุณที่แสดงบนแถบเมนูและเอกสาร
            </p>
          </div>
        </div>

        {/* Profile Notification */}
        {profileNotification && (
          <div className="px-6 pt-6">
            <div
              role="alert"
              className={`p-4 rounded-xl text-sm flex items-start gap-3 transition-all ${
                profileNotification.type === "success"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border border-rose-200 text-rose-800"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {profileNotification.type === "success" ? (
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="flex-1 font-medium">{profileNotification.text}</div>
              <button
                type="button"
                onClick={() => setProfileNotification(null)}
                className="text-gray-400 hover:text-gray-600 text-sm ml-2 cursor-pointer"
                aria-label="ปิดการแจ้งเตือน"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Card Body */}
        <div className="p-6">
          {profileLoading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-7 h-7 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span className="text-sm">กำลังโหลดข้อมูลโปรไฟล์...</span>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Avatar Section */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-4 rounded-xl bg-slate-50/70 border border-slate-100">
                {/* Avatar Preview */}
                <div className="relative group shrink-0">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-indigo-200 shadow-md bg-white flex items-center justify-center">
                    {currentDisplayAvatar && !avatarError ? (
                      <img
                        src={currentDisplayAvatar}
                        alt="รูปโปรไฟล์"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold">
                        {(firstName?.[0] || email?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Camera overlay button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="คลิกเพื่อเปลี่ยนรูปภาพ"
                    className="absolute bottom-0 right-0 p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-md border-2 border-white transition-all cursor-pointer hover:scale-105"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>

                {/* Avatar Controls */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      id="btn-upload-avatar"
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-2xs transition-colors cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      อัปโหลดรูปใหม่
                    </button>

                    <button
                      type="button"
                      onClick={handleResetToGoogleAvatar}
                      id="btn-reset-google-avatar"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 transition-colors cursor-pointer"
                    >
                      ใช้รูปจาก Google
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors cursor-pointer"
                    >
                      {showUrlInput ? "ซ่อนช่อง URL" : "ระบุผ่าน URL"}
                    </button>
                  </div>

                  {avatarFile && (
                    <p className="text-xs text-emerald-600 font-medium flex items-center justify-center sm:justify-start gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      เลือกไฟล์: {avatarFile.name} (อย่าลืมกดบันทึกข้อมูลส่วนตัว)
                    </p>
                  )}

                  {resetToDefaultAvatar && (
                    <p className="text-xs text-amber-600 font-medium">
                      * รูปโปรไฟล์จะถูกรีเซ็ตกลับไปใช้รูปบัญชี Google เมื่อกดบันทึก
                    </p>
                  )}

                  {/* URL Input collapse */}
                  {showUrlInput && (
                    <div className="pt-2 flex items-center gap-2 max-w-md">
                      <input
                        type="url"
                        value={customUrlInput}
                        onChange={(e) => setCustomUrlInput(e.target.value)}
                        placeholder="https://example.com/avatar.jpg"
                        className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleApplyCustomUrl}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
                      >
                        พรีวิว
                      </button>
                    </div>
                  )}

                  <p className="text-2xs text-gray-500">
                    แนะนำรูปสี่เหลี่ยมจัตุรัส ขนาดไม่เกิน 2 MB (รองรับ JPG, PNG, WebP หรือ GIF)
                  </p>
                </div>
              </div>

              {/* Name Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="user-first-name" className="block text-sm font-semibold text-gray-800">
                    ชื่อ <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="user-first-name"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="กรอกชื่อจริงของคุณ"
                    maxLength={100}
                    disabled={profileSubmitting}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-gray-100"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="user-last-name" className="block text-sm font-semibold text-gray-800">
                    นามสกุล
                  </label>
                  <input
                    id="user-last-name"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="กรอกนามสกุล (ถ้ามี)"
                    maxLength={100}
                    disabled={profileSubmitting}
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors disabled:bg-gray-100"
                  />
                </div>
              </div>

              {/* Email (Readonly) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="user-email-display" className="block text-sm font-semibold text-gray-800">
                    อีเมล
                  </label>
                  <span className="inline-flex items-center gap-1 text-2xs font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    <svg className="w-3 h-3 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                    </svg>
                    เชื่อมต่อด้วย Google
                  </span>
                </div>
                <input
                  id="user-email-display"
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-2.5 text-sm border border-gray-200 bg-gray-50/80 text-gray-500 rounded-xl cursor-not-allowed font-mono"
                />
                <p className="text-2xs text-gray-400">
                  บัญชีนี้ผูกกับ Google Workspace หรือ Gmail ไม่สามารถแก้ไขที่อยู่อีเมลได้
                </p>
              </div>

              {/* Profile Submit Button */}
              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={profileSubmitting || !isProfileDirty || !firstName.trim()}
                  id="btn-save-profile"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {profileSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      กำลังบันทึกข้อมูล...
                    </>
                  ) : (
                    "บันทึกข้อมูลส่วนตัว"
                  )}
                </button>

                {isProfileDirty && (
                  <button
                    type="button"
                    onClick={handleDiscardProfileChanges}
                    disabled={profileSubmitting}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    คืนค่าเดิม
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: GEMINI API KEY                                                  */}
      {/* ========================================================================= */}
      {/* Key Notification Banner */}
      {notification && (
        <div
          role="alert"
          aria-live="polite"
          className={`p-4 rounded-xl text-sm flex items-start gap-3 transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
              : notification.type === "warning"
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-rose-50 border border-rose-200 text-rose-800"
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {notification.type === "success" ? (
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : notification.type === "warning" ? (
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div className="flex-1 font-medium">{notification.text}</div>
          <button
            onClick={() => setNotification(null)}
            className="text-gray-400 hover:text-gray-600 text-sm ml-2 cursor-pointer"
            aria-label="ปิดการแจ้งเตือน"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Settings Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-purple-50/40 via-white to-transparent">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                Gemini API Key
              </h2>
              <p className="text-xs text-gray-500">
                กุญแจส่วนตัวสำหรับประมวลผลฟังก์ชัน AI สรุปเนื้อหาเอกสารทั้งฉบับ
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">สถานะ:</span>
            {loadingStatus ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" />
                กำลังตรวจสอบ...
              </span>
            ) : hasKey ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                ตั้งค่าและเข้ารหัสแล้ว
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                ยังไม่ได้ตั้งค่า
              </span>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-6 space-y-6">
          {/* Security Notice Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs text-slate-600 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              ความปลอดภัยของ API Key ใน NoteNow
            </div>
            <ul className="list-disc pl-5 space-y-1 leading-relaxed">
              <li>API Key ใช้สำหรับการเรียกโมเดล Gemini โดยใช้สิทธิ์และโควต้าของบัญชีคุณเองโดยตรง</li>
              <li>ระบบจัดเก็บแบบเข้ารหัสลับ AES-256-GCM พร้อมผูกข้อมูลผู้ใช้ (AAD) และผู้ดูแลระบบ (Admin) ไม่สามารถมองเห็นค่า Key ของคุณได้ในทุกกรณี</li>
              <li>ไม่มีการแสดงค่า Key บนหน้าจอหลังจากบันทึกแล้ว เพื่อป้องกันการถูกบันทึกภาพหน้าจอหรือการดักข้อมูล</li>
              <li>คุณสามารถทดสอบความพร้อมใช้งาน เปลี่ยน หรือลบ Key ออกจากระบบได้ตลอดเวลา</li>
            </ul>
            <div className="pt-1 flex flex-wrap items-center gap-2 text-indigo-600 font-medium">
              <span>ยังไม่มี API Key?</span>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-indigo-800 inline-flex items-center gap-1 font-semibold"
              >
                สร้าง API Key ฟรีที่ Google AI Studio
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setShowApiKeyGuide((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all cursor-pointer shadow-xs"
              >
                <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {showApiKeyGuide ? "ซ่อนคู่มือการสร้าง Key" : "📖 ดูคู่มือการสร้างและนำมาใช้งาน"}
              </button>
            </div>

            {/* Comprehensive Step-by-Step API Key Guide */}
            {showApiKeyGuide && (
              <div className="mt-3 bg-gradient-to-br from-indigo-50/90 via-purple-50/50 to-white border border-indigo-200/90 rounded-2xl p-5 text-slate-700 shadow-sm space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-600 text-white">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">
                        คู่มือ: การสร้าง Gemini API Key และนำมาใช้งานใน NoteNow
                      </h4>
                      <p className="text-xs text-slate-500">
                        ทำตามขั้นตอนง่าย ๆ เพียง 2 ส่วนนี้เพื่อเริ่มใช้งานระบบสรุปเนื้อหาเอกสารด้วย AI
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowApiKeyGuide(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded-md hover:bg-slate-200/50 transition-colors cursor-pointer"
                  >
                    ✕ ปิดคู่มือ
                  </button>
                </div>

                {/* 2-Column or Stacked Steps */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Step 1: Create API Key in Google AI Studio */}
                  <div className="bg-white/90 border border-indigo-100 rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">1</span>
                      ขั้นตอนที่ 1: ขอรับ API Key (Google AI Studio)
                    </div>
                    <ol className="space-y-2.5 text-xs text-slate-600">
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-indigo-600">1.1</span>
                        <span>
                          เปิดเว็บไซต์{" "}
                          <a
                            href="https://aistudio.google.com/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-indigo-600 underline hover:text-indigo-800"
                          >
                            aistudio.google.com/apikey
                          </a>{" "}
                          แล้วเข้าสู่ระบบด้วยบัญชี Google ของคุณ
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-indigo-600">1.2</span>
                        <span>
                          คลิกปุ่มสีน้ำเงิน <strong className="text-slate-800">&ldquo;Create API key&rdquo;</strong> (หรือสร้างคีย์ API)
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-indigo-600">1.3</span>
                        <span>
                          เลือกโปรเจกต์ Google Cloud ที่มีอยู่ หรือคลิก <strong className="text-slate-800">&ldquo;Create API key in new project&rdquo;</strong>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-indigo-600">1.4</span>
                        <span>
                          คลิกไอคอน <strong className="text-slate-800">Copy (คัดลอก)</strong> รหัสคีย์ที่สร้างขึ้น (รหัสจะขึ้นต้นด้วย <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">AIzaSy...</code>)
                        </span>
                      </li>
                    </ol>
                    <div className="pt-1">
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        เปิด Google AI Studio ตอนนี้
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </a>
                    </div>
                  </div>

                  {/* Step 2: Add into NoteNow */}
                  <div className="bg-white/90 border border-purple-100 rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-purple-700 font-bold text-xs uppercase tracking-wider">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs">2</span>
                      ขั้นตอนที่ 2: นำมาบันทึกและใช้งานใน NoteNow
                    </div>
                    <ol className="space-y-2.5 text-xs text-slate-600">
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-purple-600">2.1</span>
                        <span>
                          วางรหัสคีย์ที่คัดลอกมาลงในช่อง <strong className="text-slate-800">&ldquo;กรอก Gemini API Key&rdquo;</strong> ด้านล่างนี้
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-purple-600">2.2</span>
                        <span>
                          กดปุ่ม <strong className="text-slate-800">&ldquo;บันทึก Key&rdquo;</strong> (ระบบจะตรวจสอบสิทธิ์กับ Google และเข้ารหัสความปลอดภัยระดับ <strong className="text-slate-800">AES-256-GCM</strong> อัตโนมัติ)
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-purple-600">2.3</span>
                        <span>
                          สามารถกดปุ่ม <strong className="text-slate-800">&ldquo;ทดสอบ Key&rdquo;</strong> เพื่อยืนยันว่าสถานะเป็น <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">ใช้งานได้ปกติ</span>
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-semibold text-purple-600">2.4</span>
                        <span>
                          เปิดเอกสาร PDF ใดก็ได้ในเมนูเอกสาร แล้วกดปุ่ม <strong className="text-indigo-700">&ldquo;✨ สรุปเนื้อหาด้วย AI&rdquo;</strong> เพื่อเริ่มใช้งานได้ทันที!
                        </span>
                      </li>
                    </ol>
                  </div>
                </div>

                {/* Helpful Tips Banner */}
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                  <span className="text-base shrink-0">💡</span>
                  <div className="space-y-0.5">
                    <p className="font-semibold">ข้อควรรู้เกี่ยวกับค่าบริการและความปลอดภัย:</p>
                    <p className="text-amber-800 leading-relaxed">
                      • บัญชี Google ทั่วไปได้รับโควต้าใช้งาน <strong>ฟรี (Free Tier)</strong> ในระดับที่เพียงพอสำหรับการสรุปเอกสารประจำวันโดยไม่มีค่าใช้จ่าย
                      <br />
                      • คีย์ของคุณจะถูกเข้ารหัสแบบสองชั้นและผูกกับบัญชีของคุณโดยเฉพาะ ผู้ดูแลระบบหรือผู้ใช้อื่นไม่สามารถมองเห็นคีย์ได้ในทุกกรณี
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Results Display */}
          {testResult && (
            <div
              role="status"
              aria-live="polite"
              className={`p-4 rounded-xl border text-sm flex items-start gap-3 transition-all ${
                testResult.status === "valid"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : testResult.status === "quota"
                  ? "bg-amber-50 border-amber-200 text-amber-800"
                  : testResult.status === "invalid"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-slate-100 border-slate-300 text-slate-800"
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {testResult.status === "valid" && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1" />
                )}
                {testResult.status === "quota" && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mt-1" />
                )}
                {testResult.status === "invalid" && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 mt-1" />
                )}
                {testResult.status === "unreachable" && (
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500 mt-1" />
                )}
              </div>
              <div>
                <p className="font-semibold">
                  ผลการทดสอบ:{" "}
                  {testResult.status === "valid"
                    ? "ใช้งานได้ปกติ"
                    : testResult.status === "quota"
                    ? "ติดโควต้าการใช้งาน"
                    : testResult.status === "invalid"
                    ? "Key ใช้งานไม่ได้"
                    : "ไม่สามารถตรวจสอบได้ในขณะนี้"}
                </p>
                <p className="text-xs mt-0.5 opacity-90">{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Action Row when Key is Configured */}
          {hasKey && !showForm && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestKey}
                  disabled={isTesting}
                  id="btn-test-gemini-key"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isTesting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin text-purple-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      กำลังทดสอบกับ Google...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      ทดสอบ Key
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowForm(true);
                    setTestResult(null);
                  }}
                  id="btn-change-gemini-key"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  เปลี่ยน Key
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                id="btn-open-delete-key"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                ลบ Key
              </button>
            </div>
          )}

          {/* Key Form (Visible when no key is set OR user clicks "เปลี่ยน Key") */}
          {(!hasKey || showForm) && (
            <form onSubmit={handleSaveKey} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="gemini-api-key-input"
                  className="block text-sm font-semibold text-gray-800"
                >
                  {hasKey ? "ระบุ Gemini API Key ใหม่" : "กรอก Gemini API Key"}
                </label>
                <div className="relative">
                  <input
                    id="gemini-api-key-input"
                    type={showPasswordText ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="วาง Gemini API Key ของคุณที่นี่..."
                    autoComplete="off"
                    spellCheck={false}
                    disabled={isSubmitting}
                    className="w-full px-4 py-2.5 pr-11 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors font-mono disabled:bg-gray-100 disabled:cursor-not-allowed"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                    aria-label={showPasswordText ? "ซ่อน API Key" : "แสดง API Key"}
                  >
                    {showPasswordText ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  ระบบจะตรวจสอบสิทธิ์กับ Google เบื้องต้น และเข้ารหัสด้วย AES-256-GCM ทันที
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !apiKeyInput.trim()}
                  id="btn-save-gemini-key"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      กำลังตรวจสอบและบันทึก...
                    </>
                  ) : (
                    "บันทึก API Key"
                  )}
                </button>

                {showForm && hasKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setApiKeyInput("");
                      setShowPasswordText(false);
                    }}
                    disabled={isSubmitting}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal (Portal) */}
      {showDeleteModal &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget && !isDeleting) {
                setShowDeleteModal(false);
              }
            }}
          >
            <div
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-100 overflow-hidden animate-scale-in"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-modal-title"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>

                <h3 id="delete-modal-title" className="text-lg font-bold text-gray-900 mb-2">
                  ยืนยันการลบ Gemini API Key?
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  คุณต้องการลบ Gemini API Key ของคุณออกจากระบบใช่หรือไม่?
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-6">
                  📌 <strong>ข้อสำคัญ:</strong> เอกสารและเนื้อหาสรุป AI ที่คุณเคยสร้างไว้ในอดีตจะยังคงอยู่ทั้งหมด แต่คุณจะไม่สามารถใช้งานฟังก์ชันสรุปเนื้อหาเอกสารใหม่ได้จนกว่าจะเพิ่ม Key ใหม่อีกครั้ง
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeleting}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    id="btn-confirm-delete-key"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isDeleting ? "กำลังลบ..." : "ยืนยันการลบ"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
