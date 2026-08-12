/**
 * ลิสต์ห้องของ guild ผ่าน Discord REST (Bot token) — ให้หน้า settings เลือกห้องจาก "ชื่อ" ไม่ใช่ ID 19 หลัก
 * pattern เดียวกับ lib/caseDiscord.js (Authorization: Bot ...)
 *
 * best-effort: ดึงไม่ได้ (บอทไม่อยู่ใน guild / ไม่มีสิทธิ์ / rate limit) → คืน null
 * **null ≠ ไม่มีห้อง** — ผู้เรียกต้องแยก 2 กรณีนี้ ไม่งั้นจะกลายเป็น "ห้องหายไปหมด" ตอนบอทล่ม
 */
const API = 'https://discord.com/api/v10'
const TOKEN = process.env.DISCORD_BOT_TOKEN

// ห้องที่ส่งข้อความได้: text(0) · announcement(5) · forum(15) — ตรงกับที่ newsWatch/newsShare รองรับ
const SENDABLE = new Set([0, 5, 15])

const cache = new Map()          // guildId → { at:number, list:Array }
const TTL_MS = 60_000            // หน้า settings เปิด/สลับกลุ่มบ่อย — กันยิง Discord ซ้ำถี่ๆ

/** @returns {Promise<Array<{id:string, name:string, type:number, parentName:string|null}>|null>} */
export async function listGuildChannels(guildId) {
  if (!TOKEN || !guildId) return null

  const hit = cache.get(guildId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list

  try {
    const res = await fetch(`${API}/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${TOKEN}` },
    })
    if (!res.ok) {
      console.error('[discordChannels]', guildId, res.status, await res.text().catch(() => ''))
      return null
    }
    const all = await res.json()
    if (!Array.isArray(all)) return null

    const catName = new Map(all.filter(c => c.type === 4).map(c => [c.id, c.name]))
    const list = all
      .filter(c => SENDABLE.has(c.type))
      .map(c => ({ id: c.id, name: c.name, type: c.type, parentName: catName.get(c.parent_id) || null }))
      .sort((a, b) => (a.parentName || '').localeCompare(b.parentName || '') || a.name.localeCompare(b.name))

    cache.set(guildId, { at: Date.now(), list })
    return list
  } catch (e) {
    console.error('[discordChannels]', guildId, e.message)
    return null
  }
}
