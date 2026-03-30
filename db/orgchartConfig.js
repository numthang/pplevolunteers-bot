// db/orgchartConfig.js
const pool = require('./index');

/**
 * Upsert channel mapping ของ role
 */
async function upsertChannel({ guildId, roleId, roleName, roleColor, channelId, channelName, channelType }) {
  await pool.execute(
    `INSERT INTO dc_orgchart_config
       (guild_id, role_id, role_name, role_color, channel_id, channel_name, channel_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       role_name    = VALUES(role_name),
       role_color   = VALUES(role_color),
       channel_name = VALUES(channel_name)`,
    [guildId, roleId, roleName, roleColor ?? null, channelId, channelName, channelType]
  );
}

/**
 * ดึง config ทั้งหมดของ guild (ไม่รวม excluded channels)
 * คืนเป็น Map: roleId → { roleName, roleColor, textChannels, voiceChannels }
 */
async function getConfig(guildId) {
  const [rows] = await pool.execute(
    `SELECT role_id, role_name, role_color, channel_id, channel_name, channel_type
     FROM dc_orgchart_config
     WHERE guild_id = ? AND excluded = 0
     ORDER BY role_name, channel_type, channel_name`,
    [guildId]
  );

  const config = new Map();
  for (const row of rows) {
    if (!config.has(row.role_id)) {
      config.set(row.role_id, {
        roleId:        row.role_id,
        roleName:      row.role_name,
        roleColor:     row.role_color,
        textChannels:  [],
        voiceChannels: [],
      });
    }
    const entry = config.get(row.role_id);
    const ch = { id: row.channel_id, name: row.channel_name };
    // ✅ Bug fix: voice → voiceChannels, text+forum → textChannels
    if (row.channel_type === 'voice') entry.voiceChannels.push(ch);
    else entry.textChannels.push(ch);
  }

  return config;
}

/**
 * ดึง config เฉพาะบาง roles
 */
async function getConfigByRoleIds(guildId, roleIds) {
  if (!roleIds.length) return new Map();
  const placeholders = roleIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT role_id, role_name, role_color, channel_id, channel_name, channel_type
     FROM dc_orgchart_config
     WHERE guild_id = ? AND role_id IN (${placeholders})
     ORDER BY role_name, channel_type, channel_name`,
    [guildId, ...roleIds]
  );

  const config = new Map();
  for (const row of rows) {
    if (!config.has(row.role_id)) {
      config.set(row.role_id, {
        roleId:        row.role_id,
        roleName:      row.role_name,
        roleColor:     row.role_color,
        textChannels:  [],
        voiceChannels: [],
      });
    }
    const entry = config.get(row.role_id);
    const ch = { id: row.channel_id, name: row.channel_name };
    if (row.channel_type === 'voice') entry.voiceChannels.push(ch);
    else entry.textChannels.push(ch);
  }

  return config;
}

async function deleteRole(guildId, roleId) {
  await pool.execute(
    `DELETE FROM dc_orgchart_config WHERE guild_id = ? AND role_id = ?`,
    [guildId, roleId]
  );
}

async function deleteChannel(guildId, roleId, channelId) {
  await pool.execute(
    `DELETE FROM dc_orgchart_config WHERE guild_id = ? AND role_id = ? AND channel_id = ?`,
    [guildId, roleId, channelId]
  );
}

async function roleExists(guildId, roleId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM dc_orgchart_config WHERE guild_id = ? AND role_id = ? LIMIT 1`,
    [guildId, roleId]
  );
  return rows.length > 0;
}

async function excludeChannel(guildId, roleId, channelId) {
  await pool.execute(
    `UPDATE dc_orgchart_config SET excluded = 1
     WHERE guild_id = ? AND role_id = ? AND channel_id = ?`,
    [guildId, roleId, channelId]
  );
}

async function unexcludeChannel(guildId, roleId, channelId) {
  await pool.execute(
    `UPDATE dc_orgchart_config SET excluded = 0
     WHERE guild_id = ? AND role_id = ? AND channel_id = ?`,
    [guildId, roleId, channelId]
  );
}

module.exports = {
  upsertChannel, getConfig, getConfigByRoleIds,
  deleteRole, deleteChannel, roleExists,
  excludeChannel, unexcludeChannel,
};