// web/lib/org.js — Org layer: resolve guild ในเครือเดียวกัน (ฝั่ง web · คู่กับ bot db/org.js)
import pool from '@/db/index.js'

// คืน array ของ guild_id ทั้งหมดใน org เดียวกับ guildId (รวมตัวมันเอง)
// - guild อยู่ใน org → คืนทุก guild ในเครือ
// - guild ไม่อยู่ org ไหน (org_id NULL) → คืน [guildId] อย่างเดียว = พฤติกรรมเดิม (per-guild isolate)
export async function getOrgGuildIds(guildId) {
  const { rows } = await pool.query(
    `SELECT g2.guild_id
       FROM dc_guilds g1
       JOIN dc_guilds g2 ON g2.org_id = g1.org_id
      WHERE g1.guild_id = $1 AND g1.org_id IS NOT NULL`,
    [guildId]
  )
  return rows.length ? rows.map(r => r.guild_id) : [guildId]
}
