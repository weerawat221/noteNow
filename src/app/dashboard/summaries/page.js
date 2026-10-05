/**
 * หน้าสรุป AI — แสดงรายการ summaries ทั้งหมด
 */
export default function SummariesPage() {
  return (
    <div className="p-6 lg:p-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">สรุป AI</h1>
        <p className="text-gray-500 mt-1 text-sm">
          ดูสรุปเนื้อหาที่สร้างด้วย Gemini AI
        </p>
      </div>

      {/* Empty state */}
      <div className="card p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          ยังไม่มีสรุป
        </h3>
        <p className="text-gray-500 text-sm mb-4">
          เปิดเอกสารแล้วกดปุ่ม &quot;สรุปด้วย AI&quot; เพื่อสร้างสรุป
        </p>
      </div>
    </div>
  );
}
