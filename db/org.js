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

// org_id ของ guild (สำหรับ bot write-path ที่ finance scope เป็น org_id แล้ว) · null ถ้า guild ไม่ผูก org
async function orgIdOfGuild(guildId) {
  const { rows } = await pool.query(
    `SELECT org_id FROM dc_guilds WHERE guild_id = $1`,
    [guildId]
  );
  return rows[0]?.org_id ?? null;
}

// users.id จาก discord_id (person-ref ใน finance เป็น users.id แล้ว ไม่ใช่ discord snowflake) · null ถ้าไม่พบ
async function userIdByDiscord(discordId) {
  if (!discordId) return null;
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE discord_id = $1`,
    [discordId]
  );
  return rows[0]?.id ?? null;
}

// users row จาก discord_id — create-on-first-sight (identity split: dc_members → users + org_members)
// เขียนเฉพาะคอลัมน์ identity · profile/roles ทั้งหมดอยู่ org_members (per-guild)
// COALESCE กัน field ที่ไม่ได้ส่งมาลบของเดิมทิ้ง
async function upsertUserByDiscord(discordId, { username, firstname, lastname } = {}) {
  if (!discordId) return null;
  const { rows } = await pool.query(
    `INSERT INTO users (discord_id, username, firstname, lastname)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) WHERE discord_id IS NOT NULL DO UPDATE SET
       username   = COALESCE(EXCLUDED.username, users.username),
       firstname  = COALESCE(EXCLUDED.firstname, users.firstname),
       lastname   = COALESCE(EXCLUDED.lastname, users.lastname),
       updated_at = NOW()
     RETURNING id`,
    [discordId, username ?? null, firstname ?? null, lastname ?? null]
  );
  return rows[0].id;
}

module.exports = { getOrgGuildIds, orgIdOfGuild, userIdByDiscord, upsertUserByDiscord };
