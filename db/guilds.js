const pool = require('./index')

async function upsertGuilds(guildsCache) {
  for (const guild of guildsCache.values()) {
    if (!guild.name) continue;
    await pool.query(
      `INSERT INTO dc_guilds (guild_id, name, icon_url, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (guild_id) DO UPDATE SET
         name = EXCLUDED.name,
         icon_url = EXCLUDED.icon_url,
         updated_at = NOW()`,
      [guild.id, guild.name, guild.iconURL() || null]
    )
  }
}

module.exports = { upsertGuilds }
