import { notFound } from 'next/navigation'
import { redirectToLogin } from '@/lib/auth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getOrgEnabledFeatures } from '@/lib/orgFeatures.js'

/**
 * บล็อก direct link เข้า route ของ feature ที่ปิดอยู่ — 404
 * ใช้ใน layout.js ของแต่ละ app (finance/calling/docs/case/posts)
 *
 * สวิตช์ฟีเจอร์อยู่ที่ org ที่เดียว (2026-07-22) — เดิมแตกสาขา guild/guildless
 * แล้ว guild ชนะ ทำให้หน้า /org/settings/features ไม่มีผลกับ org ที่มี guild
 * (ai_mention ยังราย guild แต่บอทอ่านเอง ไม่ผ่านตัวนี้)
 *
 * ⚠️ 2 ด่านนี้คนละความหมาย ห้ามยุบรวม (แก้ 2026-08-08):
 *   ไม่มี session → **redirect ไปล็อกอิน** ไม่ใช่ 404 · ระบบยังไม่รู้ว่าเป็นใคร จึงตอบไม่ได้
 *     ว่าฟีเจอร์เปิดหรือปิด (สวิตช์ผูกกับ org ของคนนั้น) · ทุกคนที่ยังไม่ล็อกอินเจอผลลัพธ์
 *     เดียวกันทุก path จึงไม่รั่วว่ามีหน้านี้อยู่จริงไหม
 *   ล็อกอินแล้วแต่ org ปิดฟีเจอร์ → 404 ตามเดิม · ตรงนี้แหละที่ต้องปิดบัง
 *   เดิมเป็น notFound() ทั้งคู่ → คนไม่ล็อกอินเปิด /posts/55 เจอ 404 ลอยๆ (user แจ้ง 2026-08-08)
 */
export async function requireFeature(session, feature) {
  const userId = session?.user?.userId
  if (!userId) await redirectToLogin()

  const { activeOrg } = await resolveActiveOrg(userId)
  if (!activeOrg) notFound()

  const enabled = await getOrgEnabledFeatures(activeOrg.id)
  if (!enabled.includes(feature)) notFound()
}
