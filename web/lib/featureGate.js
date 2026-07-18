import { notFound } from 'next/navigation'
import { getGuildId } from '@/lib/guildContext.js'
import { getEnabledFeatures, guildsOfOrg } from '@/db/guilds.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getOrgEnabledFeatures } from '@/lib/orgFeatures.js'

/**
 * บล็อก direct link เข้า route ของ feature ที่ปิดอยู่ — 404
 * org-aware (mirror app/layout.js): guild org → per-guild config · guildless org → org-native features
 *   เดิม gate ด้วย guild เสมอ → หลัง seam fix (getGuildId email user→null) finance (org-native)
 *   จะ 404 ผิดสำหรับ guildless org · ต้องแตกสาขาเหมือน layout
 * guild org ไม่เปลี่ยนพฤติกรรม (ยัง getEnabledFeatures(getGuildId) เหมือนเดิม)
 * ใช้ใน layout.js ของแต่ละ app (finance/calling/docs)
 */
export async function requireFeature(session, feature) {
  const enabled = await enabledFeaturesFor(session)
  if (!enabled.includes(feature)) notFound()
}

async function enabledFeaturesFor(session) {
  const userId = session?.user?.userId
  if (userId) {
    const { activeOrg } = await resolveActiveOrg(userId)
    // guildless org → org-native features (finance ฯลฯ) · calling/docs guild-based ไม่อยู่ที่นี่ → 404 ถูกต้อง
    if (activeOrg) {
      const guilds = await guildsOfOrg(activeOrg.id)
      if (guilds.length === 0) return getOrgEnabledFeatures(activeOrg.id)
    }
  }
  // guild org / legacy (unauth/degenerate) → per-guild config เดิม
  return getEnabledFeatures(await getGuildId(session))
}
