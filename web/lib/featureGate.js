import { notFound } from 'next/navigation'
import { getGuildId } from '@/lib/guildContext.js'
import { getEnabledFeatures } from '@/db/guilds.js'

/**
 * บล็อก direct link เข้า route ของ feature ที่ปิดอยู่ใน guild ปัจจุบัน — 404
 * ใช้ใน layout.js ของแต่ละ app (finance/calling/docs/case)
 */
export async function requireFeature(session, feature) {
  const guildId = await getGuildId(session)
  const enabled = await getEnabledFeatures(guildId)
  if (!enabled.includes(feature)) notFound()
}
