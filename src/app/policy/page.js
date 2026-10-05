export const metadata = {
  title: "นโยบายความเป็นส่วนตัว (Privacy Policy) - NoteNow",
  description: "นโยบายความเป็นส่วนตัวและการจัดการข้อมูลผู้ใช้ของ NoteNow",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 py-16 px-6 sm:px-12 lg:px-24">
      <div className="max-w-4xl mx-auto space-y-8 bg-slate-900/60 p-8 sm:p-12 rounded-2xl border border-slate-800 backdrop-blur-md">
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold text-white mb-2">นโยบายความเป็นส่วนตัว (Privacy Policy)</h1>
          <p className="text-sm text-slate-400">อัปเดตล่าสุด: 6 ตุลาคม 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">1. ข้อมูลเกี่ยวกับเรา</h2>
          <p className="text-slate-300 leading-relaxed">
            <strong>NoteNow</strong> (&quot;เรา&quot;, &quot;แอปพลิเคชัน&quot;) คือเว็บแอปพลิเคชันสำหรับการเปิดอ่าน จดบันทึกบนเอกสาร PDF 
            และสรุปเนื้อหาเอกสารด้วยปัญญาประดิษฐ์ โดยมุ่งเน้นการรักษาความปลอดภัยและความเป็นส่วนตัวของข้อมูลผู้ใช้งานเป็นสำคัญ
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">2. ข้อมูลที่เราเก็บรวบรวมและการเข้าถึง</h2>
          <p className="text-slate-300 leading-relaxed">
            เมื่อคุณเข้าสู่ระบบด้วยบัญชี Google เราจะขออนุญาตเข้าถึงข้อมูลเท่าที่จำเป็นสำหรับการทำงานของระบบเท่านั้น:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300">
            <li><strong>ข้อมูลบัญชีพื้นฐาน (Profile &amp; Email):</strong> ชื่อ, ที่อยู่อีเมล, และรูปภาพโปรไฟล์ เพื่อใช้ระบุตัวตนและแสดงผลในระบบ</li>
            <li>
              <strong>การเข้าถึง Google Drive (Scopes: drive.file, drive.readonly):</strong> เราขอสิทธิ์เข้าถึงเพื่อเปิดและดาวน์โหลดเฉพาะไฟล์ PDF 
              ที่คุณเลือกเชื่อมโยงมายังแอปพลิเคชัน เพื่อนำมาแสดงผลสำหรับจดบันทึกและส่งไปสรุปเนื้อหาตามคำสั่งของคุณเท่านั้น
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">3. วัตถุประสงค์ในการใช้ข้อมูล</h2>
          <p className="text-slate-300 leading-relaxed">
            เราใช้ข้อมูลของคุณเพื่อวัตถุประสงค์ต่อไปนี้เท่านั้น:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300">
            <li>ยืนยันตัวตนและจัดการบัญชีผู้ใช้งาน</li>
            <li>แสดงผลไฟล์ PDF ที่คุณเลือกจาก Google Drive เพื่อการอ่านและจดบันทึก (Annotations)</li>
            <li>ประมวลผลสรุปเนื้อหาเอกสารผ่าน Gemini AI ตามที่คุณเป็นผู้สั่งการ</li>
            <li>บันทึกตำแหน่งโน้ตและประวัติการสรุปเนื้อหาในบัญชีส่วนตัวของคุณ</li>
          </ul>
        </section>

        <section className="space-y-3 border-l-4 border-indigo-500 pl-4 bg-indigo-950/20 py-3 pr-4 rounded-r-lg">
          <h2 className="text-xl font-semibold text-indigo-300">4. ข้อกำหนดการใช้ข้อมูลผู้ใช้ Google (Google User Data Policy &amp; Limited Use)</h2>
          <p className="text-slate-300 leading-relaxed">
            การใช้งานและการถ่ายโอนข้อมูลที่ได้รับจาก Google APIs ของ NoteNow ไปยังแอปอื่นจะเป็นไปตาม{" "}
            <a 
              href="https://developers.google.com/terms/api-services-user-data-policy" 
              target="_blank" 
              rel="noreferrer"
              className="text-indigo-400 underline hover:text-indigo-300"
            >
              Google API Services User Data Policy
            </a>
            {" "}รวมถึงข้อกำหนด Limited Use:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-slate-300 mt-2">
            <li><strong>ไม่มีการขายข้อมูล:</strong> เราจะไม่ขายข้อมูลผู้ใช้ Google ให้แก่บุคคลที่สามไม่ว่าในกรณีใดๆ</li>
            <li><strong>ไม่มีการนำไปใช้เพื่อโฆษณา:</strong> ข้อมูลของคุณจะไม่ถูกนำไปใช้เพื่อการยิงโฆษณาที่กำหนดเป้าหมาย (Targeted Advertising)</li>
            <li>
              <strong>ไม่มีการนำไปฝึกโมเดล AI (No AI Model Training):</strong> ข้อมูลเอกสารหรือเนื้อหาที่ได้จาก Google Drive ของคุณ 
              <strong>จะไม่ถูกนำไปใช้ในการฝึกฝน (Train/Fine-tune) โมเดลปัญญาประดิษฐ์ทั่วไป</strong> หรือโมเดล Machine Learning ใดๆ
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">5. การจัดเก็บและความปลอดภัยของข้อมูล</h2>
          <p className="text-slate-300 leading-relaxed">
            ข้อมูลสำคัญ เช่น Token และ API Key ได้รับการเข้ารหัสลับด้วยมาตรฐาน <strong>AES-256-GCM</strong> 
            และฐานข้อมูลมีการจำกัดสิทธิ์การเข้าถึงด้วย Row Level Security (RLS) เพื่อให้มั่นใจว่าผู้ใช้งานแต่ละท่านจะเห็นเฉพาะข้อมูลของตนเองเท่านั้น
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">6. สิทธิ์ของผู้ใช้และการลบข้อมูล</h2>
          <p className="text-slate-300 leading-relaxed">
            คุณสามารถยกเลิกการเชื่อมโยงเอกสาร หรือขอลบข้อมูลบัญชีของคุณทั้งหมดออกจากระบบได้ทุกเมื่อ 
            โดยติดต่อผู้ดูแลระบบผ่านอีเมลด้านล่างนี้
          </p>
        </section>

        <section className="space-y-3 border-t border-slate-800 pt-6">
          <h2 className="text-xl font-semibold text-white">7. ช่องทางการติดต่อ (Contact Us)</h2>
          <p className="text-slate-300">
            หากมีข้อสงสัยเกี่ยวกับนโยบายความเป็นส่วนตัวนี้ สามารถติดต่อเราได้ที่:
          </p>
          <p className="text-indigo-400 font-mono">
            Email: koonball451@gmail.com
          </p>
        </section>
      </div>
    </div>
  );
}
