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
