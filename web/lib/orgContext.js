// web/lib/orgContext.js — org-scope resolver ของ feature (finance ก่อน)
//
// getOrgId = active org ของ user (org switcher, cookie 'active_org') — org-first
// เหตุ: org-native feature scope ด้วย org_id → self-serve org ที่ไม่มี guild (MRSJAN) ต้องเข้าถึงได้
//   resolveActiveOrg คืน org แรก (active) ถ้ายังไม่เลือก → Discord user org เดียว = เหมือนเดิม (ไม่มี regression)
// switcher dual-write selected_guild = guild หลักของ org → getGuildId (guild-based features) aligned เสมอ
// fallback: userId ไม่มี / 0 org → derive จาก guild ที่ active (Discord door ที่ยังไม่ผูก org)
import { getGuildId } from './guildContext.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { resolveActiveOrg } from './activeOrg.js'

export async function getOrgId(session) {
  const userId = session?.user?.userId
  if (userId) {
    const { activeOrg } = await resolveActiveOrg(userId)
    // มี userId แต่ไม่มี active org → null (ไม่ fallback ไป org อื่น)
    // กัน user ไม่มีองค์กร resolve ไป org default (env.GUILD_ID) แล้วเห็น finance public/internal ของ org นั้น
    return activeOrg ? activeOrg.id : null
  }
  // ไม่มี userId (legacy/ไม่ควรเกิดหลัง unify) → guild-derived
  return await orgIdOfGuild(await getGuildId(session))
}
