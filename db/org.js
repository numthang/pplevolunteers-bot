// db/org.js — Org layer: resolve guild ในเครือเดียวกัน (ใช้ให้ roster match/dedup มองข้าม guild)
const pool = require('./index');

// คืน array ของ guild_id ทั้งหมดใน org เดียวกับ guildId (รวมตัวมันเอง)
// - guild อยู่ใน org → คืนทุก guild ในเครือ (ใช้ WHERE guild_id IN (...) / IN dedup)
// - guild ไม่อยู่ org ไหน (org_id NULL) → คืน [guildId] อย่างเดียว = พฤติกรรมเดิม (per-guild isolate)
async function getOrgGuildIds(guildId) {
  const { rows } = await pool.query(
    `SELECT g2.guild_id
       FROM dc_guilds g1
       JOIN dc_guilds g2 ON g2.org_id = g1.org_id
      WHERE g1.guild_id = $1 AND g1.org_id IS NOT NULL`,
    [guildId]
  );
  return rows.length ? rows.map(r => r.guild_id) : [guildId];
}

module.exports = { getOrgGuildIds };
