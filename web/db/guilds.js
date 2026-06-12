import pool from './index.js'

export async function getGuilds() {
  const { rows } = await pool.query(
    `SELECT guild_id, name FROM dc_guilds ORDER BY name ASC`
  )
  return rows
}

export async function getAdminGuildIds(discordId) {
  const { rows } = await pool.query(
    `SELECT guild_id FROM dc_members
     WHERE discord_id = $1
       AND (',' || roles || ',' LIKE '%,Admin,%' OR ',' || roles || ',' LIKE '%,เลขาธิการ,%')`,
    [discordId]
  )
  return rows.map(r => r.guild_id)
}

/**
 * Guilds ที่ user เป็น member จริง (INNER JOIN dc_guilds = เฉพาะ guild ที่ register ในระบบ)
 * ใช้ render guild switcher dropdown
 * @param {object} opts - { all: true } = super_admin เห็นทุก guild (ไม่ใช่แค่ที่เป็น member)
 */
export async function getUserGuilds(discordId, { all = false } = {}) {
  if (all) return getGuilds()
  if (!discordId) return []
  const { rows } = await pool.query(
    `SELECT g.guild_id, g.name
     FROM dc_members m
     JOIN dc_guilds g ON g.guild_id = m.guild_id
     WHERE m.discord_id = $1
     ORDER BY g.name ASC`,
    [discordId]
  )
  return rows
}

/**
 * เช็คว่า user เป็น member ของ guild นี้จริง — gate กัน cookie ปลอมไปดู guild ที่ไม่ได้เป็นสมาชิก
 */
export async function isGuildMember(discordId, guildId) {
  if (!discordId || !guildId) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM dc_members WHERE discord_id = $1 AND guild_id = $2 LIMIT 1`,
    [discordId, guildId]
  )
  return rows.length > 0
}

/**
 * Features ที่ guild นี้เปิด (toggle ได้: 'calling', 'contacts')
 * finance + bot เปิดตลอดทุก guild → ไม่อยู่ใน toggle · default (ไม่มี config) = []
 * เก็บใน dc_guild_config key 'enabled_features' เป็น json array เช่น ["calling","contacts"]
 */
export async function getEnabledFeatures(guildId) {
  if (!guildId) return []
  const { rows } = await pool.query(
    `SELECT value FROM dc_guild_config WHERE guild_id = $1 AND "key" = 'enabled_features'`,
    [guildId]
  )
  const v = rows[0]?.value
  return Array.isArray(v) ? v : []
}
