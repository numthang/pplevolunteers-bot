/**
 * Web → Discord DM (Bot token) — pattern เดียวกับ lib/caseDiscord.js (Authorization: Bot ...)
 *
 * ทำไมยิง REST เองไม่ผ่านบอท: บอทเป็นคนละ process ไม่มี bridge ระหว่างเว็บกับบอทในโปรเจกต์นี้
 * และเว็บยิง Discord REST ตรงอยู่แล้วหลายที่ (caseDiscord / discordChannels / discordRoles)
 *
 * ⚠️ ไม่ใช่ best-effort เหมือน caseDiscord — ผู้เรียกต้องรู้ว่าส่งผ่านหรือไม่ผ่าน
 *    เพราะเป็นตัวตัดสินว่าจะเขียน notified_at ลง DB ไหม (log ต้องไม่โกหกว่าแจ้งแล้ว)
 */

const API = 'https://discord.com/api/v10'
const SUPPRESS_EMBEDS = 1 << 2   // ข้อความอาจมีลิงก์ → กัน Discord unfurl embed รกๆ

/**
 * เปิดห้อง DM แล้วส่งข้อความ
 * @param {string} discordId  snowflake ของผู้รับ (users.discord_id)
 * @param {string} content    ข้อความ (ตัดที่ 2000 ตัวอักษรตามลิมิต Discord)
 * @returns {Promise<{ok: boolean, reason?: string, status?: number}>}
 *   reason: no_token | no_recipient | dm_blocked (ผู้ใช้ปิด DM) | discord_error | network
 */
export async function sendDm(discordId, content) {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) return { ok: false, reason: 'no_token' }
  if (!discordId) return { ok: false, reason: 'no_recipient' }

  const headers = { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }

  try {
    // 1) เปิด (หรือหยิบของเดิม) ห้อง DM — Discord คืนห้องเดิมถ้าเคยเปิดแล้ว ไม่สร้างซ้ำ
    const chRes = await fetch(`${API}/users/@me/channels`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recipient_id: String(discordId) }),
    })
    if (!chRes.ok) {
      const body = await chRes.text().catch(() => '')
      console.error('[discordDm.openChannel]', discordId, chRes.status, body)
      return { ok: false, reason: 'discord_error', status: chRes.status }
    }
    const channel = await chRes.json()
    if (!channel?.id) return { ok: false, reason: 'discord_error', status: chRes.status }

    // 2) ส่งข้อความ
    const msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: String(content).slice(0, 2000), flags: SUPPRESS_EMBEDS }),
    })
    if (!msgRes.ok) {
      const body = await msgRes.text().catch(() => '')
      console.error('[discordDm.send]', discordId, msgRes.status, body)
      // 50007 = "Cannot send messages to this user" — ปิดรับ DM จากคนในเซิร์ฟเวอร์ / บล็อกบอท
      // เคสนี้ไม่ใช่บั๊ก ต้องบอกคนกดให้ไปแจ้งช่องทางอื่น ไม่ใช่ขึ้น error รวมๆ
      const blocked = body.includes('50007')
      return { ok: false, reason: blocked ? 'dm_blocked' : 'discord_error', status: msgRes.status }
    }

    return { ok: true }
  } catch (e) {
    console.error('[discordDm]', discordId, e.message)
    return { ok: false, reason: 'network' }
  }
}
