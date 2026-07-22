import { notFound } from 'next/navigation'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getOrgEnabledFeatures } from '@/lib/orgFeatures.js'

/**
 * บล็อก direct link เข้า route ของ feature ที่ปิดอยู่ — 404
 * ใช้ใน layout.js ของแต่ละ app (finance/calling/docs/case)
 *
 * สวิตช์ฟีเจอร์อยู่ที่ org ที่เดียว (2026-07-22) — เดิมแตกสาขา guild/guildless
 * แล้ว guild ชนะ ทำให้หน้า /org/settings/features ไม่มีผลกับ org ที่มี guild
 * (ai_mention ยังราย guild แต่บอทอ่านเอง ไม่ผ่านตัวนี้)
 */
export async function requireFeature(session, feature) {
  const userId = session?.user?.userId
  if (!userId) notFound()

  const { activeOrg } = await resolveActiveOrg(userId)
  if (!activeOrg) notFound()

  const enabled = await getOrgEnabledFeatures(activeOrg.id)
  if (!enabled.includes(feature)) notFound()
}
