// db/orgchartConfig.js
const pool = require('./index');

/**
 * Upsert channel mapping ของ role
 */
async function upsertChannel({ guildId, roleId, roleName, roleColor, channelId, channelName, channelType }) {
  await pool.query(
    `INSERT INTO dc_orgchart_config
       (guild_id, role_id, role_name, role_color, channel_id, channel_name, channel_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (guild_id, role_id, channel_id) DO UPDATE SET
       role_name    = EXCLUDED.role_name,
       role_color   = EXCLUDED.role_color,
       channel_name = EXCLUDED.channel_name`,
    [guildId, roleId, roleName, roleColor ?? null, channelId, channelName, channelType]
  );
}

/**
 * ดึง config ทั้งหมดของ guild (ไม่รวม excluded channels)
 * คืนเป็น Map: roleId → { roleName, roleColor, textChannels, voiceChannels }
 */
async function getConfig(guildId) {
  const { rows } = await pool.query(
    `SELECT role_id, role_name, role_color, channel_id, channel_name, channel_type
     FROM dc_orgchart_config
     WHERE guild_id = $1 AND excluded = FALSE
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
  const { rows } = await pool.query(
    `SELECT role_id, role_name, role_color, channel_id, channel_name, channel_type
     FROM dc_orgchart_config
     WHERE guild_id = $1 AND excluded = FALSE AND role_id = ANY($2)
     ORDER BY role_name, channel_type, channel_name`,
    [guildId, roleIds]
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

/**
 * ดึง unique roles ของ group ที่ระบุ
 * คืนเป็น [{ roleId, roleName, roleColor }] เรียงตาม roleName
 */
async function getRolesByGroup(guildId, groupName) {
  const { rows } = await pool.query(
    `SELECT role_id, role_name, role_color
     FROM dc_orgchart_config
     WHERE guild_id = $1 AND excluded::boolean = FALSE AND group_name = $2
     GROUP BY role_id, role_name, role_color
     ORDER BY role_name`,
    [guildId, groupName]
  );

  return rows.map(row => ({
    roleId:    row.role_id,
    roleName:  row.role_name,
    roleColor: row.role_color,
  }));
}

async function saveSnapshot(guildId, roleId, days, topMembers) {
  await pool.query(
    `INSERT INTO dc_orgchart_snapshot (guild_id, role_id, days, top_members, computed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (guild_id, role_id) DO UPDATE SET
       days        = EXCLUDED.days,
       top_members = EXCLUDED.top_members,
       computed_at = NOW()`,
    [guildId, roleId, days, JSON.stringify(topMembers)]
  );
}

async function getSnapshotByGroup(guildId, groupName) {
  const { rows } = await pool.query(
    `SELECT s.role_id, s.days, s.top_members, s.computed_at, c.role_name, c.role_color
     FROM dc_orgchart_snapshot s
     JOIN (
       SELECT DISTINCT guild_id, role_id, role_name, role_color
       FROM dc_orgchart_config
       WHERE guild_id = $1 AND group_name = $2 AND excluded = FALSE
     ) c ON s.guild_id = c.guild_id
          AND s.role_id = c.role_id
     ORDER BY c.role_name`,
    [guildId, groupName]
  );
  return rows.map(r => ({
    roleId:     r.role_id,
    roleName:   r.role_name,
    roleColor:  r.role_color,
    days:       r.days,
    topMembers: typeof r.top_members === 'string' ? JSON.parse(r.top_members) : r.top_members,
    computedAt: r.computed_at,
  }));
}

async function setRoleGroup(guildId, roleId, groupName) {
  await pool.query(
    `UPDATE dc_orgchart_config SET group_name = $1
     WHERE guild_id = $2 AND role_id = $3`,
    [groupName, guildId, roleId]
  );
}

async function deleteRole(guildId, roleId) {
  await pool.query(
    `DELETE FROM dc_orgchart_config WHERE guild_id = $1 AND role_id = $2`,
    [guildId, roleId]
  );
}

async function deleteChannel(guildId, roleId, channelId) {
  await pool.query(
    `DELETE FROM dc_orgchart_config WHERE guild_id = $1 AND role_id = $2 AND channel_id = $3`,
    [guildId, roleId, channelId]
  );
}

async function roleExists(guildId, roleId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM dc_orgchart_config WHERE guild_id = $1 AND role_id = $2 LIMIT 1`,
    [guildId, roleId]
  );
  return rows.length > 0;
}

async function excludeChannel(guildId, roleId, channelId) {
  await pool.query(
    `UPDATE dc_orgchart_config SET excluded = TRUE
     WHERE guild_id = $1 AND role_id = $2 AND channel_id = $3`,
    [guildId, roleId, channelId]
  );
}

async function unexcludeChannel(guildId, roleId, channelId) {
  await pool.query(
    `UPDATE dc_orgchart_config SET excluded = FALSE
     WHERE guild_id = $1 AND role_id = $2 AND channel_id = $3`,
    [guildId, roleId, channelId]
  );
}

module.exports = {
  upsertChannel, getConfig, getConfigByRoleIds, getRolesByGroup, setRoleGroup,
  saveSnapshot, getSnapshotByGroup,
  deleteRole, deleteChannel, roleExists,
  excludeChannel, unexcludeChannel,
};
