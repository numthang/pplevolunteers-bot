import { cookies } from 'next/headers'
import { isGuildMember } from '@/db/guilds.js'

export const SELECTED_GUILD_COOKIE = 'selected_guild'

/**
 * คืน guild_id ที่ request นี้ทำงานอยู่ — รากฐานของ multi-guild ทั้งระบบ
 *
 * ลำดับ resolve:
 *   1. cookie 'selected_guild' ถ้ามี + user เป็น member จริง → ใช้ค่านั้น
 *   2. fallback = process.env.GUILD_ID (อาสาประชาชน) — single-guild ทำงานเหมือนเดิม
 *
 * validate membership ทุกครั้ง = กัน user ปลอม cookie ไปดู guild ที่ไม่ได้เป็นสมาชิก
 */
export async function getGuildId(session) {
  const fallback = process.env.GUILD_ID
  const discordId = session?.user?.discordId
  if (!discordId) return fallback

  const cookieStore = await cookies()
  const selected = cookieStore.get(SELECTED_GUILD_COOKIE)?.value
  if (!selected || selected === fallback) return fallback

  const ok = await isGuildMember(discordId, selected)
  return ok ? selected : fallback
}
