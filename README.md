# 📝 NoteNow

**NoteNow** คือเว็บแอปพลิเคชันสำหรับการเปิดอ่านและจดบันทึกบนเอกสาร PDF จาก Google Drive โดยตรง พร้อมระบบสรุปเนื้อหาอัจฉริยะด้วยปัญญาประดิษฐ์ (Gemini AI) ในคลิกเดียว พร้อมระบบบริหารจัดการข้อมูลสำหรับผู้ดูแลระบบ (Admin Portal) เต็มรูปแบบ

---

## ✨ ฟีเจอร์หลัก (Key Features)

### 1. 📂 เชื่อมต่อ Google Drive & การจัดการเอกสาร
- เชื่อมต่อและดึงไฟล์ PDF จาก Google Drive ของผู้ใช้โดยตรงแบบเรียลไทม์
- ระบบสร้างและจัดหมวดหมู่เอกสารลงในโฟลเดอร์
- รองรับการเรียงลำดับเอกสารตาม:
  - ชื่อไฟล์ (ก-ฮ / A-Z)
  - วันที่สร้าง / วันที่แก้ไข
  - **ไฟล์ที่มีการจดบันทึกล่าสุด**

### 2. ✏️ ระบบจดบันทึกและวาดเขียนบน PDF (Interactive PDF Annotator)
- แสดงผลเอกสาร PDF คุณภาพสูงผ่าน **PDF.js**
- วาดเขียน ไฮไลต์ แทรกกล่องข้อความ และรูปทรงด้วย **Fabric.js**
- **Multi-select & Bulk Actions**: เลือกโน้ตหลายรายการพร้อมกันเพื่อลบหรือเปลี่ยนสีได้ในคลิกเดียว
- **Group Navigation**: คลิกที่กลุ่มโน้ตแล้วหน้าจอจะเลื่อน (Scroll) ไปยังตำแหน่งของกลุ่มนั้นบนหน้าเอกสารทันที
- บันทึกการเปลี่ยนแปลง (Auto-save) ลงฐานข้อมูล Supabase อัตโนมัติ

### 3. 🤖 ระบบสรุปเนื้อหาอัจฉริยะด้วย Gemini AI
- รองรับสถาปัตยกรรม **BYOK (Bring Your Own Key)** ผู้ใช้สามารถใส่ Gemini API Key ของตนเองได้
- คีย์ถูกเข้ารหัสจัดเก็บอย่างปลอดภัยด้วย **AES-GCM-256**
- ปรับแต่งการสรุปได้หลากหลาย:
  - เลือกภาษา (ไทย / อังกฤษ)
  - เลือกระดับความละเอียด (ย่อสรุปสั้น / สรุปละเอียดเป็นหัวข้อ)
  - เลือกรูปแบบ (Bullet points / Executive Summary / Q&A)
- ระบบป้องกันการสรุปซ้ำซ้อน (Locking System) และระบบ Retry อัตโนมัติเมื่อชน Rate Limit (429)

### 4. 🛡️ ระบบบริหารจัดการสำหรับผู้ดูแลระบบ (Admin Portal)
ระบบแยกหน้าจอและสิทธิ์การเข้าถึงอย่างชัดเจนสำหรับ Admin (`role = 'A'`):
- **Dashboard & สถิติภาพรวม**:
  - กราฟสถิติผู้ใช้งานรายวันแบบ Interactive (เลือกดูย้อนหลัง 7 วัน, 30 วัน, 90 วัน, 1 ปี)
  - รายงานจำนวนเอกสารที่เชื่อมโยงจาก Google Drive
  - รายงานสถิติการใช้งาน AI ในการสรุปเนื้อหา
- **จัดการข้อมูลผู้ใช้ (User Management)**:
  - ดูรายชื่อ ค้นหา และตรวจสอบสถานะบัญชี
  - แก้ไขชื่อและอัปโหลดรูปโปรไฟล์ผู้ใช้
  - ระงับ / ปลดระงับการใช้งานบัญชี
  - **ทดสอบความถูกต้องของ Gemini API Key** ของผู้ใช้แต่ละคนได้ทันที
- **จัดการเอกสารทั้งระบบ (Document Management)**:
  - ค้นหาเอกสารทั้งหมดข้ามผู้ใช้
  - ตัวกรองตามเจ้าของเอกสาร และสถานะการสรุป AI
  - แก้ไขชื่อเอกสาร หรือยกเลิกการเชื่อมโยง (Unlink)

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

| ส่วนประกอบ | เทคโนโลยี |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Server Actions) |
| **UI Library** | [React 19](https://react.dev/) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Canvas & PDF** | [Fabric.js](http://fabricjs.com/) v6, [PDF.js](https://mozilla.github.io/pdf.js/) |
| **AI Integration** | [@google/genai](https://github.com/googleapis/google-genai-node) (Gemini API) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Auth, Storage) |
| **OAuth 2.0** | Google Drive API & Google OAuth |
| **Security** | Node Crypto (AES-256-GCM / Versioned Key Management) |

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
notenow/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # Backend API Endpoints
│   │   │   ├── admin/                # Admin APIs (Stats, Users, Documents, Key Testing)
│   │   │   ├── documents/            # Document CRUD & Notes
│   │   │   ├── drive/                # Google Drive sync & files
│   │   │   ├── gemini/               # Gemini status & proxy
│   │   │   └── summaries/            # AI Summary generation
│   │   ├── dashboard/                # User & Admin Dashboard Pages
│   │   │   ├── admin/                # Admin Users & Documents Management
│   │   │   ├── documents/            # Document Viewer & Editor
│   │   │   └── settings/             # User Settings & API Key config
│   │   ├── login/                    # Authentication Page
│   │   └── page.js                   # Landing Page
│   ├── components/                   # Reusable UI Components
│   │   ├── admin/                    # Admin Dashboard Charts & Views
│   │   ├── layout/                   # Sidebar & Navigation
│   │   └── notes/                    # PDF Annotator, Toolbar, AI Summary Modals
│   ├── lib/                          # Utility & Business Logic
│   │   ├── auth-admin.js             # Admin authorization check
│   │   ├── crypto.js & secrets.js    # Encryption & Key management
│   │   ├── gemini-summary.js         # Gemini API Integration & Prompting
│   │   ├── note-grouping.js          # Note multi-select & grouping helpers
│   │   └── supabase/                 # Supabase client/server instances
│   └── middleware.js                 # Auth & route protection middleware
├── supabase/
│   └── migrations/                   # SQL migration scripts
├── tests/                            # Unit & Integration Tests
└── .env.example                      # Environment variables template
```

---

## 🚀 เริ่มต้นใช้งาน (Getting Started)

### 1. ความต้องการของระบบ (Prerequisites)
- [Node.js](https://nodejs.org/) เวอร์ชัน 18.17 หรือใหม่กว่า
- โปรเจกต์ [Supabase](https://supabase.com/)
- Google Cloud Console Project (เปิดใช้งาน Google Drive API & OAuth 2.0)

### 2. การติดตั้ง (Installation)
โคลนโปรเจกต์และติดตั้ง Dependencies:

```bash
git clone <repository-url>
cd notenow
npm install
```

### 3. ตั้งค่า Environment Variables
คัดลอกไฟล์ `.env.example` เป็น `.env.local`:

```bash
cp .env.example .env.local
```

กรอกค่าคอนฟิกต่าง ๆ ใน `.env.local`:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret

# Encryption (สำหรับเข้ารหัส Gemini Key & Google Token)
KEY_ENCRYPTION_KEYS=v1:<base64-encoded-32-byte-key>
ENCRYPTION_KEY=<64-char-hex-key>

# Gemini AI Model
GEMINI_MODEL_NAME=gemini-2.5-flash
```

### 4. ติดตั้งโครงสร้างฐานข้อมูล (Database Migrations)
รันไฟล์คำสั่ง SQL ในโฟลเดอร์ `supabase/migrations/` บน Supabase SQL Editor ตามลำดับ:
1. `001_create_tables.sql` (สร้างตารางหลัก, ฟังก์ชัน, และ Row Level Security)
2. `002_secure_gemini_key_permissions.sql` (ตั้งค่าความปลอดภัยระดับคีย์)

### 5. เปิดรัน Development Server
```bash
npm run dev
```

เปิดเบราว์เซอร์ไปที่ [http://localhost:3000](http://localhost:3000)

---

## 🧪 การรันแบบทดสอบ (Testing)

โปรเจกต์มีชุดแบบทดสอบครอบคลุมทั้งระบบความปลอดภัย, การจัดกลุ่มโน้ต, การสรุปด้วย AI และ Admin Portal:

```bash
npm test
```

---

## 🔒 ความปลอดภัย (Security)
- สิทธิ์ข้อมูลของผู้ใช้ถูกควบคุมด้วย **Row Level Security (RLS)** ของ PostgreSQL
- ข้อมูลที่เป็นความลับ (Gemini API Key, Google OAuth Tokens) จะถูกเข้ารหัสแบบ Symmetric AES-256-GCM ก่อนจัดเก็บลงฐานข้อมูลเสมอ
- ผู้ดูแลระบบ (Admin) ไม่สามารถดู Plaintext API Key ของผู้ใช้ได้ แต่สามารถส่ง Ping ตรวจสอบสถานะความถูกต้องของคีย์ได้ผ่าน Service Role
# noteNow
