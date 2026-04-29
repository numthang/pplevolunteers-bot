const pool = require('./index')

async function upsertGuilds(guildsCache) {
  for (const guild of guildsCache.values()) {
    await pool.query(
      `INSERT INTO dc_guilds (guild_id, name, icon_url, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE name=VALUES(name), icon_url=VALUES(icon_url), updated_at=NOW()`,
      [guild.id, guild.name, guild.iconURL() || null]
    )
  }
}

module.exports = { upsertGuilds }
