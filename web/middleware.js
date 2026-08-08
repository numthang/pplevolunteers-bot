import { NextResponse } from 'next/server'

/**
 * ส่ง path ปัจจุบันเข้า request header ให้ server component อ่านได้
 *
 * ทำไมต้องมี: App Router ไม่มี API ให้ layout/page ฝั่ง server รู้ pathname ของตัวเอง
 * แต่ `requireFeature()` (lib/featureGate.js) ต้องใช้เพื่อ redirect คนที่ยังไม่ล็อกอิน
 * ไปหน้าล็อกอินพร้อม callbackUrl ที่ตรงใบ — ไม่งั้นได้แค่ path ของ layout (`/posts`)
 * แทนที่จะเป็น `/posts/55`
 *
 * ห้ามใส่ logic อย่างอื่นในนี้ — middleware รันทุก request
 */
export function middleware(req) {
  const headers = new Headers(req.headers)
  headers.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  // ข้าม static / รูป / ไฟล์ที่มีนามสกุล — เหลือเฉพาะ route ที่ render จริง
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)'],
}
