import pool from './index.js'

export async function getGuilds() {
  const [rows] = await pool.query(
    `SELECT guild_id, name FROM dc_guilds ORDER BY name ASC`
  )
  return rows
}
