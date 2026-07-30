// /bot/media/basket — หน้าตะกร้าสื่อถูกยุบเข้าหน้าโพสต์แล้ว (2026-07-30) เหลือไว้เป็นตัวส่งต่อ
//
// ปุ่ม "🖼️ จัดการรูป" ที่บอทวางไว้ในข้อความเก่า (handlers/basketHandler.js) เป็น Link button
// แก้ย้อนหลังไม่ได้ → URL เดิมต้องใช้ได้ตลอดไป · ตะกร้า 1 ใบ = โพสต์ 1 แถวใน post_episodes อยู่แล้ว
//
// เป็น Route Handler ไม่ใช่ page เพราะต้อง **เซ็ต cookie** ก่อน redirect (server component ทำไม่ได้):
// /posts/[id] ตัดสินสิทธิ์จาก org ที่ active อยู่ (cookie 'active_org') ไม่ใช่จาก guild ของลิงก์
// → คนที่อยู่หลาย org กดลิงก์จากดิสฯ ตอน active org ชี้ที่อื่นจะเจอ 404 เฉยๆ โดยไม่รู้ว่าต้องสลับ org
// (resolveActiveOrg() ยัง validate membership ของค่าใน cookie อยู่ดี — เซ็ตมั่วไม่ได้สิทธิ์เพิ่ม)
import { NextResponse } from 'next/server'
import { getOpenBasket } from '@/db/posts/basket.js'
import { ACTIVE_ORG_COOKIE } from '@/lib/activeOrg.js'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const guild = searchParams.get('guild')
  const channel = searchParams.get('channel')

  const ep = guild && channel ? await getOpenBasket(guild, channel) : null
  // ไม่เจอ = ตะกร้าถูกล้าง/archive ไปแล้ว (หรือเรียกมาโดยไม่มีพารามิเตอร์) → ส่งไปหน้ารายการ
  const res = NextResponse.redirect(new URL(ep ? `/posts/${ep.id}` : '/posts', req.url))
  if (ep?.org_id) res.cookies.set(ACTIVE_ORG_COOKIE, String(ep.org_id), { path: '/' })
  return res
}
