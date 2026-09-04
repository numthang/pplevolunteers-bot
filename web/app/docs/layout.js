import { getSession, currentPath } from '@/lib/auth.js'
import { requireFeature } from '@/lib/featureGate.js'

export const metadata = { title: { template: '%s — Docs', default: 'Docs' } }

/**
 * ⛔ ยกเว้น `/docs/sign/*` จาก requireFeature — **ห้ามเอาออกโดยไม่อ่านย่อหน้านี้**
 *
 * requireFeature() redirect ไปล็อกอินตั้งแต่ฝั่ง server เมื่อไม่มี session (featureGate.js)
 * ด่านนี้คือด่านแรกจริงที่ผู้รับเงินชนเวลาเปิดลิงก์เซ็น — ไม่ใช่ POST /api/docs/sign
 * ตราบใดที่ยังมีอยู่ โหมด `open` (ถือลิงก์ = เซ็นได้ ไม่ต้องล็อกอิน) ไม่มีทางทำงาน
 * เพราะคนโดนเด้งไปหน้าแรกก่อนหน้าเซ็นจะ render ด้วยซ้ำ
 *
 * ทำไมยกเว้นได้ปลอดภัย — ลิงก์เซ็นไม่ได้พึ่ง gate นี้ตั้งแต่แรก:
 *   ตัวตน  → sign_token (UUID) ที่ส่งถึงมือผู้รับ + policy ของ org (ตรวจที่ทุก endpoint ปลายทาง)
 *   ฟีเจอร์ → GET /api/docs/sign/verify ตรวจว่า org ของ *ใบนั้น* เปิด docs ไหม (ไม่ใช่ org
 *             ของคนเปิด ซึ่งในโหมด open ไม่มี) · ปิดอยู่ = 404 เหมือนเดิม
 *   org ที่ไม่ได้เปิดโหมด open → หน้าเซ็นแสดง LoginPanel เอง (page.js) พฤติกรรมเท่าเดิมเป๊ะ
 *
 * ใช้ startsWith กับ path ที่ normalize แล้วจาก currentPath() (กัน header ปลอม/`//evil`)
 */
export default async function DocsLayout({ children }) {
  const path = await currentPath()
  const isSignLink = path === '/docs/sign' || path.startsWith('/docs/sign/')

  if (!isSignLink) {
    const session = await getSession()
    await requireFeature(session, 'docs')
  }

  return (
    // -mx ต้องตรงกับ padding ของ <main> ใน app/layout.js (px-1 sm:px-4) เป๊ะ — ดึงกลับเกินเมื่อไหร่
    // หน้าล้นขอบจอทันที · เดิมเป็น -mx-3 คู่กับ px-3 พอ root เปลี่ยนเป็น px-1 เลยเกินข้างละ 8px
    // ทุกหน้าใน /docs บนมือถือ (mobileAudit: "หน้ากว้าง 385px เกินจอ 375px")
    <div className="-mx-1 sm:-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4">
        {children}
      </div>
    </div>
  )
}
