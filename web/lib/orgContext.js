// web/lib/orgContext.js — org-scope resolver ของ feature (finance ก่อน)
//
// getOrgId = org ของ guild ที่ resolve แล้ว (getGuildId) — ไม่ใช่ active_org cookie แยก
// เหตุ: access-control (getEffectiveIdentity/resolveAccess) ยัง guild-keyed อยู่
//   → derive org จาก guild เดียวกัน = data-scope กับ access-scope aligned เสมอ (ไม่มี seam)
// guildless org ยังเข้าไม่ถึง (ตั้งใจ) — จะเปิดตอน org-switcher endgame ที่ย้าย RBAC เป็น org-keyed พร้อมกัน
import { getGuildId } from './guildContext.js'
import { orgIdOfGuild } from '@/db/guilds.js'

export async function getOrgId(session) {
  const guildId = await getGuildId(session)
  return await orgIdOfGuild(guildId)
}
