import Link from "next/link";

/**
 * หน้าแรก — Landing page
 */
export default function HomePage() {
  return (
    <div className="min-h-screen gradient-hero relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-20 right-20 w-72 h-72 rounded-full opacity-20 animate-pulse-soft"
          style={{ background: "radial-gradient(circle, #818cf8, transparent)" }}
        />
        <div
          className="absolute bottom-20 left-20 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #2dd4bf, transparent)" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #fff, transparent)" }}
        />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-5">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #818cf8, #6366f1)" }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <span className="text-white font-semibold text-lg">NoteNow</span>
        </div>
        <Link
          href="/login"
          className="btn btn-secondary text-sm"
          id="btn-nav-login"
        >
          เข้าสู่ระบบ
        </Link>
      </nav>

      {/* Hero */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 pt-20 pb-32 lg:pt-32 lg:pb-40">
        <div className="animate-fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-white/80 text-sm mb-6 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-soft" />
            ระบบพร้อมใช้งาน
          </div>

          <h1 className="text-4xl lg:text-6xl font-bold text-white leading-tight max-w-3xl mx-auto">
            จดบันทึกและ
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #818cf8, #2dd4bf)" }}
            >
              สรุปเนื้อหา
            </span>
            <br />
            ด้วยปัญญาประดิษฐ์
          </h1>

          <p className="text-lg text-white/60 mt-6 max-w-xl mx-auto leading-relaxed">
            เปิด PDF จาก Google Drive จดบันทึกบนเอกสาร
            และสรุปเนื้อหาทั้งเล่มด้วย Gemini AI ในคลิกเดียว
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/login"
              className="btn btn-primary text-base px-8 py-3.5"
              id="btn-hero-start"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              เริ่มใช้งานฟรี
            </Link>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-20 max-w-4xl w-full">
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
            title="เชื่อมต่อ Google Drive"
            description="เปิด PDF โดยตรงจาก Google Drive ไม่ต้องอัปโหลด"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            }
            title="จดบันทึกบน PDF"
            description="วาด พิมพ์ข้อความ หรือไฮไลท์บนหน้าเอกสาร"
          />
          <FeatureCard
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
            title="สรุปด้วย AI"
            description="ใช้ Gemini สรุปเนื้อหาทั้งเอกสารในคลิกเดียว"
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="glass-dark rounded-xl p-6 text-left hover:bg-white/10 transition-all duration-300 group">
      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-indigo-300 mb-4 group-hover:bg-white/15 transition-colors">
        {icon}
      </div>
      <h3 className="text-white font-semibold mb-2">{title}</h3>
      <p className="text-white/50 text-sm leading-relaxed">{description}</p>
    </div>
  );
}
