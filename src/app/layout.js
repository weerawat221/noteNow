import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-thai",
  display: "swap",
});

export const metadata = {
  title: "NoteNow — จดบันทึกและสรุปเนื้อหาด้วย AI",
  description:
    "ระบบจดบันทึกบน PDF จาก Google Drive พร้อมสรุปเนื้อหาด้วยปัญญาประดิษฐ์แบบรู้สร้าง",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body className="font-sans antialiased bg-gray-50 text-gray-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
