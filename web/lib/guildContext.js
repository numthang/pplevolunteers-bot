import { cookies } from 'next/headers'
import { isGuildMember } from '@/db/guilds.js'

export const SELECTED_GUILD_COOKIE = 'selected_guild'

/**
 * คืน guild_id ที่ request นี้ทำงานอยู่ — รากฐานของ multi-guild ทั้งระบบ
 *
 * ลำดับ resolve:
 *   1. email user (มี userId แต่ไม่มี discordId) → guildless: ไม่ผูก guild ใด → null
 *      กัน fallback ไป env.GUILD_ID (PPLE) แล้วเห็น data ข้าม tenant (bug-024)
 *      consumer guild-based: requireFeature(null)→notFound · query guild_id=null→[] เอง
 *      TODO: email member ของ guild-backed org → derive guild จาก active org
 *            (ทำคู่กับ getRealRoles ที่โหลด web_roles ด้วย userId — ตอนนี้ 0 user แบบนี้)
 *   2. Discord user + cookie 'selected_guild' + เป็น member จริง → ใช้ค่านั้น
 *   3. fallback = process.env.GUILD_ID (อาสาประชาชน) — unauth/degenerate + single-guild เดิม
 *
 * validate membership ทุกครั้ง = กัน user ปลอม cookie ไปดู guild ที่ไม่ได้เป็นสมาชิก
 */
export async function getGuildId(session) {
  const fallback = process.env.GUILD_ID
  const discordId = session?.user?.discordId
  const userId = session?.user?.userId
  if (!discordId) return userId ? null : fallback

  const cookieStore = await cookies()
  const selected = cookieStore.get(SELECTED_GUILD_COOKIE)?.value
  if (!selected || selected === fallback) return fallback

  const ok = await isGuildMember(discordId, selected)
  return ok ? selected : fallback
}
