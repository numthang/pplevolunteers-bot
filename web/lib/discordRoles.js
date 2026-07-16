/**
 * Web → Discord REST (Bot token) — เพิ่ม/ถอด role ให้ member ในเซิร์ฟเวอร์
 * pattern เดียวกับ lib/caseDiscord.js (Authorization: Bot ...)
 *
 * Discord = source of truth ของ role · เว็บแค่เป็นรีโมทสั่งเพิ่ม/ถอด
 * ต้องการ: bot มีสิทธิ์ Manage Roles + role เป้าหมายอยู่ต่ำกว่า role สูงสุดของ bot
 * best-effort: error → log + คืน false (route จะแปลงเป็น 502)
 */

const API = 'https://discord.com/api/v10'
const TOKEN = process.env.DISCORD_BOT_TOKEN

function headers() {
  return { Authorization: `Bot ${TOKEN}` }
}

/** เพิ่ม role ให้ member → true/false (Discord ตอบ 204 เมื่อสำเร็จ) */
export async function addGuildRole(guildId, discordId, roleId) {
  if (!TOKEN || !guildId || !discordId || !roleId) return false
  try {
    const res = await fetch(`${API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
      method: 'PUT',
      headers: headers(),
    })
    if (!res.ok) {
      console.error('[discordRoles.addGuildRole]', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('[discordRoles.addGuildRole]', e.message)
    return false
  }
}

/** ถอด role จาก member → true/false */
export async function removeGuildRole(guildId, discordId, roleId) {
  if (!TOKEN || !guildId || !discordId || !roleId) return false
  try {
    const res = await fetch(`${API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
      method: 'DELETE',
      headers: headers(),
    })
    if (!res.ok) {
      console.error('[discordRoles.removeGuildRole]', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('[discordRoles.removeGuildRole]', e.message)
    return false
  }
}
