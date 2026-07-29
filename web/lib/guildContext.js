import { cookies } from 'next/headers'
import { isGuildMember, guildsOfOrg } from '@/db/guilds.js'
import { resolveActiveOrg } from './activeOrg.js'

export const SELECTED_GUILD_COOKIE = 'selected_guild'

/**
 * คืน guild_id ที่ request นี้ทำงานอยู่ — รากฐานของ multi-guild ทั้งระบบ
 *
 * ⚠️ guild ต้องอยู่ใน "org ที่ active" เสมอ (2026-07-29)
 *    เดิมเช็คแค่ membership ไม่เช็คว่า guild อยู่ org ไหน → สลับไป org ที่ไม่มี guild
 *    แล้วยังเห็น config ของ guild เดิม/env.GUILD_ID = cross-tenant leak (ตระกูลเดียวกับ bug-024)
 *
 * ลำดับ resolve:
 *   1. email user (มี userId แต่ไม่มี discordId) → guildless: ไม่ผูก guild ใด → null
 *      กัน fallback ไป env.GUILD_ID (PPLE) แล้วเห็น data ข้าม tenant (bug-024)
 *   2. มี userId → ยึด active org เป็นหลัก:
 *      - ไม่มี active org → null
 *      - org ไม่มี guild เลย → null (org นี้ไม่มี guild context · หน้า /bot/* ต้องบอกว่ายังไม่เชื่อม Discord)
 *      - มี guild → cookie ที่อยู่ใน org นี้ + เป็น member จริง · ไม่งั้นใช้ guild หลักของ org
 *   3. ไม่มี userId (legacy/unauth) → cookie ที่ validate membership แล้ว · fallback env.GUILD_ID
 *
 * consumer guild-based: requireFeature(null)→notFound · query guild_id=null→[] เอง
 */
export async function getGuildId(session) {
  const fallback = process.env.GUILD_ID
  const discordId = session?.user?.discordId
  const userId = session?.user?.userId
  if (!discordId) return userId ? null : fallback

  const cookieStore = await cookies()
  const selected = cookieStore.get(SELECTED_GUILD_COOKIE)?.value

  if (userId) {
    const { activeOrg } = await resolveActiveOrg(userId)
    if (!activeOrg) return null

    const orgGuildIds = (await guildsOfOrg(activeOrg.id)).map(g => g.guild_id)
    if (orgGuildIds.length === 0) return null   // org ไม่มี guild → ไม่มี guild context

    if (selected && orgGuildIds.includes(selected)) {
      const ok = await isGuildMember(discordId, selected)
      if (ok) return selected
    }
    // cookie ว่าง / ชี้ไป guild ของ org อื่น → ใช้ guild หลักของ org นี้
    return orgGuildIds.includes(fallback) ? fallback : orgGuildIds[0]
  }

  if (!selected || selected === fallback) return fallback
  const ok = await isGuildMember(discordId, selected)
  return ok ? selected : fallback
}
