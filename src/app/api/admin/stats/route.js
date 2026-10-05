import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/stats?range=7d|14d|30d|90d|all
 * รวบรวมสถิติสำหรับหน้า Dashboard ของผู้ดูแลระบบ
 */
export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { adminClient } = auth;
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7d";

    // กำหนดวันเริ่มต้นตามช่วงเวลาที่เลือก
    const now = new Date();
    let startDate = null;
    let daysCount = 7;

    if (range === "7d") {
      daysCount = 7;
      startDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    } else if (range === "14d") {
      daysCount = 14;
      startDate = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
    } else if (range === "30d") {
      daysCount = 30;
      startDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    } else if (range === "90d") {
      daysCount = 90;
      startDate = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
    } else if (range === "all") {
      daysCount = 30; // fallback bucket length for chart
      startDate = null;
    }
    if (startDate) {
      startDate.setHours(0, 0, 0, 0);
    }

    // ดึงข้อมูลหลักแบบขนาน
    const [usersRes, docsRes, summariesRes] = await Promise.all([
      adminClient
        .from("users")
        .select("user_id, email, first_name, last_name, role, is_suspended, created_at, gemini_api_key_enc"),
      adminClient
        .from("documents")
        .select("document_id, document_name, file_size, connected_at, user_id"),
      adminClient
        .from("ai_summaries")
        .select("summary_id, created_at, document_id, user_id"),
    ]);

    if (usersRes.error) throw usersRes.error;
    if (docsRes.error) throw docsRes.error;
    if (summariesRes.error) throw summariesRes.error;

    const users = usersRes.data || [];
    const documents = docsRes.data || [];
    const summaries = summariesRes.data || [];

    // แผนที่ User ID เพื่อความรวดเร็วในการ lookup
    const userMap = new Map();
    users.forEach((u) => userMap.set(u.user_id, u));

    // คำนวณสถิติภาพรวม
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => !u.is_suspended).length;
    const suspendedUsers = users.filter((u) => u.is_suspended).length;
    const withGeminiKeyCount = users.filter((u) => Boolean(u.gemini_api_key_enc)).length;

    const totalDocuments = documents.length;
    const totalStorageBytes = documents.reduce((sum, d) => sum + (d.file_size || 0), 0);
    const averageDocumentsPerUser = totalUsers > 0 ? (totalDocuments / totalUsers).toFixed(1) : 0;

    const totalSummaries = summaries.length;
    const summarizedDocIds = new Set(summaries.map((s) => s.document_id));
    const summarizedDocsCount = summarizedDocIds.size;

    // คำนวณจำนวนที่เกิดขึ้นในช่วง range
    const filterByDate = (items, dateField) => {
      if (!startDate) return items.length;
      return items.filter((item) => new Date(item[dateField]) >= startDate).length;
    };

    const newUsersInRange = filterByDate(users, "created_at");
    const documentsInRange = filterByDate(documents, "connected_at");
    const summariesInRange = filterByDate(summaries, "created_at");

    // สร้างข้อมูล Daily Time Series สำหรับกราฟ
    const chartDays = daysCount;
    const dailyStats = [];
    const startForChart = startDate ? new Date(startDate) : new Date(now.getTime() - (chartDays - 1) * 24 * 60 * 60 * 1000);
    startForChart.setHours(0, 0, 0, 0);

    for (let i = 0; i < chartDays; i++) {
      const curDate = new Date(startForChart.getTime() + i * 24 * 60 * 60 * 1000);
      const yyyy = curDate.getFullYear();
      const mm = String(curDate.getMonth() + 1).padStart(2, "0");
      const dd = String(curDate.getDate()).padStart(2, "0");
      const dateKey = `${yyyy}-${mm}-${dd}`;

      // นับจำนวนของวันนั้น
      const newUsersCount = users.filter((u) => {
        const d = new Date(u.created_at);
        return (
          d.getFullYear() === curDate.getFullYear() &&
          d.getMonth() === curDate.getMonth() &&
          d.getDate() === curDate.getDate()
        );
      }).length;

      const docsCount = documents.filter((doc) => {
        const d = new Date(doc.connected_at);
        return (
          d.getFullYear() === curDate.getFullYear() &&
          d.getMonth() === curDate.getMonth() &&
          d.getDate() === curDate.getDate()
        );
      }).length;

      const sumsCount = summaries.filter((s) => {
        const d = new Date(s.created_at);
        return (
          d.getFullYear() === curDate.getFullYear() &&
          d.getMonth() === curDate.getMonth() &&
          d.getDate() === curDate.getDate()
        );
      }).length;

      const thaiMonths = [
        "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
        "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
      ];
      const thaiLabel = `${curDate.getDate()} ${thaiMonths[curDate.getMonth()]}`;

      dailyStats.push({
        date: dateKey,
        label: thaiLabel,
        newUsers: newUsersCount,
        documents: docsCount,
        summaries: sumsCount,
      });
    }

    // อันดับผู้ใช้ที่มีเอกสารเชื่อมต่อมากที่สุด Top 5
    const userDocCounts = {};
    documents.forEach((d) => {
      userDocCounts[d.user_id] = (userDocCounts[d.user_id] || 0) + 1;
    });

    const topUsersByDocuments = Object.entries(userDocCounts)
      .map(([userId, count]) => {
        const u = userMap.get(parseInt(userId, 10));
        return {
          user_id: parseInt(userId, 10),
          email: u?.email || "Unknown",
          name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.email || "ผู้ใช้",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ประวัติการใช้ AI ล่าสุด 5 รายการ
    const recentSummaries = [...summaries]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map((s) => {
        const doc = documents.find((d) => d.document_id === s.document_id);
        const u = userMap.get(s.user_id);
        return {
          summary_id: s.summary_id,
          created_at: s.created_at,
          document_id: s.document_id,
          document_name: doc?.document_name || "ไม่พบชื่อเอกสาร",
          user_email: u?.email || "ไม่ระบุ",
          user_name: [u?.first_name, u?.last_name].filter(Boolean).join(" ") || u?.email || "ผู้ใช้",
        };
      });

    return NextResponse.json({
      range,
      stats: {
        users: {
          total: totalUsers,
          active: activeUsers,
          suspended: suspendedUsers,
          withGeminiKey: withGeminiKeyCount,
          inRange: newUsersInRange,
        },
        documents: {
          total: totalDocuments,
          totalStorageBytes,
          averagePerUser: averageDocumentsPerUser,
          summarizedCount: summarizedDocsCount,
          inRange: documentsInRange,
        },
        summaries: {
          total: totalSummaries,
          inRange: summariesInRange,
        },
      },
      dailyStats,
      topUsersByDocuments,
      recentSummaries,
    });
  } catch (err) {
    console.error("GET /api/admin/stats error:", err);
    return NextResponse.json({ error: err.message || "เกิดข้อผิดพลาดในการดึงสถิติ" }, { status: 500 });
  }
}
