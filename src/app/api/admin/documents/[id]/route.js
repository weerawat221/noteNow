import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/documents/[id]
 * แอดมินแก้ไขชื่อเอกสารของผู้ใช้
 */
export async function PATCH(request, { params }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const documentId = parseInt(id, 10);
    if (!documentId || isNaN(documentId)) {
      return NextResponse.json({ error: "รหัสเอกสารไม่ถูกต้อง" }, { status: 400 });
    }

    const body = await request.json();
    const documentName = body.document_name ? String(body.document_name).trim() : "";

    if (!documentName) {
      return NextResponse.json({ error: "กรุณาระบุชื่อเอกสาร (ห้ามเว้นว่าง)" }, { status: 400 });
    }

    const { adminClient } = auth;
    const { data: updated, error: updateError } = await adminClient
      .from("documents")
      .update({
        document_name: documentName,
        updated_at: new Date().toISOString(),
      })
      .eq("document_id", documentId)
      .select()
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!updated) {
      return NextResponse.json({ error: "ไม่พบเอกสารที่ต้องการแก้ไข" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      document: updated,
      message: "แก้ไขชื่อเอกสารเรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("PATCH /api/admin/documents/[id] error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการแก้ไขเอกสาร" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/documents/[id]
 * แอดมินลบการเชื่อมต่อเอกสารออกจากระบบ NoteNow (ไม่กระทบไฟล์ใน Google Drive)
 */
export async function DELETE(request, { params }) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const documentId = parseInt(id, 10);
    if (!documentId || isNaN(documentId)) {
      return NextResponse.json({ error: "รหัสเอกสารไม่ถูกต้อง" }, { status: 400 });
    }

    const { adminClient } = auth;
    const { error: deleteError } = await adminClient
      .from("documents")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({
      success: true,
      message: "ลบการเชื่อมต่อเอกสารออกจากระบบเรียบร้อยแล้ว",
    });
  } catch (err) {
    console.error("DELETE /api/admin/documents/[id] error:", err);
    return NextResponse.json(
      { error: err.message || "เกิดข้อผิดพลาดในการลบการเชื่อมต่อเอกสาร" },
      { status: 500 }
    );
  }
}
