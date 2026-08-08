import { getServerSession } from 'next-auth'
import { authOptions } from './auth-options.js'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function getSession() {
  return getServerSession(authOptions)
}

/**
 * path+query ของ request ปัจจุบัน — มาจาก middleware.js (header `x-pathname`)
 * App Router ไม่มี API ให้ server component รู้ pathname ตัวเอง จึงต้องพึ่ง header
 * ไม่มี header (ถูกเรียกนอก request context) → '/'
 * เช็ค /^\/(?![/\\])/ กัน open-redirect เผื่อ header ถูกปลอมมาจากข้างนอก
 */
export async function currentPath() {
  const p = (await headers()).get('x-pathname')
  return typeof p === 'string' && /^\/(?![/\\])/.test(p) ? p : '/'
}

/**
 * ยังไม่ล็อกอิน → ส่งไปหน้าล็อกอิน (`/` มี LoginPanel) พร้อม callbackUrl กลับมาหน้าเดิม
 * ⚠️ ใช้ตัวนี้เสมอ อย่าเขียน `redirect('/')` เอง — ไม่งั้นล็อกอินเสร็จเด้งไป /dashboard
 *    แทนที่จะกลับหน้าที่ user ตั้งใจเปิด (user แจ้ง 2026-08-08 จากเคส /posts/55)
 */
export async function redirectToLogin() {
  redirect(`/?callbackUrl=${encodeURIComponent(await currentPath())}`)
}

// Use in server components — redirects to login if not authenticated
export async function requireAuth() {
  const session = await getSession()
  if (!session) await redirectToLogin()
  return session
}
