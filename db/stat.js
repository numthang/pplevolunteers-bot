// db/stat.js
// Queries สำหรับ /stat-* commands

const pool = require('./index');

/**
 * Overview ของ server
 */
async function getServerOverview(guildId, days) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(DISTINCT user_id)            AS active_users,
       COALESCE(SUM(message_count), 0)    AS total_msgs,
       COALESCE(SUM(voice_seconds), 0)    AS total_voice
     FROM dc_activity_daily
     WHERE guild_id = ?
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [guildId, days]
  );
  return rows[0];
}

/**
 * Top channels ของ server
 */
async function getTopChannels(guildId, days, limit = 5, sortBy = 'messages') {
  const orderBy = sortBy === 'voice'
    ? 'SUM(d.voice_seconds) DESC'
    : 'SUM(d.message_count) DESC';

  const [rows] = await pool.execute(
    `SELECT
       d.channel_id,
       COALESCE(c.channel_name, d.channel_id) AS channel_name,
       COUNT(DISTINCT d.user_id)               AS contributors,
       COALESCE(SUM(d.message_count), 0)       AS messages,
       COALESCE(SUM(d.voice_seconds), 0)       AS voice_seconds
     FROM dc_activity_daily d
     LEFT JOIN dc_orgchart_config c
       ON d.channel_id = c.channel_id AND d.guild_id = c.guild_id
     WHERE d.guild_id = ?
       AND d.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY d.channel_id, channel_name
     ORDER BY ${orderBy}
     LIMIT ${limit}`,
    [guildId, days]
  );
  return rows;
}

/**
 * Top members ของ server (optional: filter by role)
 * score = messages × 10 + voiceSeconds + mentions × 30
 */
async function getTopMembers(guildId, days, limit = 10, roleMembers = null, sortBy = 'score') {
  let sql = `
    SELECT
      d.user_id,
      COALESCE(SUM(d.message_count), 0) AS messages,
      COALESCE(SUM(d.voice_seconds), 0) AS voice_seconds,
      COALESCE((
        SELECT COUNT(*) FROM dc_activity_mentions m
        WHERE m.guild_id = d.guild_id
          AND m.user_id = d.user_id
          AND m.timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ), 0) AS mentions
    FROM dc_activity_daily d
    WHERE d.guild_id = ?
      AND d.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;

  const params = [days, guildId, days];

  if (roleMembers && roleMembers.size > 0) {
    const placeholders = [...roleMembers].map(() => '?').join(',');
    sql += ` AND d.user_id IN (${placeholders})`;
    params.push(...roleMembers);
  }

  const orderBy = sortBy === 'voice'    ? 'SUM(d.voice_seconds) DESC'
    : sortBy === 'messages'             ? 'SUM(d.message_count) DESC'
    : '(SUM(d.message_count) * 10 + SUM(d.voice_seconds) + mentions * 20) DESC';

  sql += `
    GROUP BY d.user_id
    ORDER BY ${orderBy}
    LIMIT ${limit}`;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Stats ของ channel
 */
async function getChannelStats(guildId, channelId, days, topN = 5) {
  const [overview] = await pool.execute(
    `SELECT
       COUNT(DISTINCT user_id)         AS contributors,
       COALESCE(SUM(message_count), 0) AS total_msgs,
       COALESCE(SUM(voice_seconds), 0) AS total_voice,
       MAX(date)                       AS last_active
     FROM dc_activity_daily
     WHERE guild_id = ? AND channel_id = ?
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [guildId, channelId, days]
  );

  const [topUsers] = await pool.execute(
    `SELECT
       user_id,
       COALESCE(SUM(message_count), 0) AS messages,
       COALESCE(SUM(voice_seconds), 0) AS voice_seconds
     FROM dc_activity_daily
     WHERE guild_id = ? AND channel_id = ?
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY user_id
     ORDER BY (SUM(message_count) * 10 + SUM(voice_seconds)) DESC
     LIMIT ${topN}`,
    [guildId, channelId, days]
  );

  return { overview: overview[0], topUsers };
}

/**
 * Stats ของ user
 */
async function getUserStats(guildId, userId, days, topN = 5) {
  const [activity] = await pool.execute(
    `SELECT
       COALESCE(SUM(message_count), 0) AS messages,
       COALESCE(SUM(voice_seconds), 0) AS voice_seconds,
       MAX(date)                       AS last_active
     FROM dc_activity_daily
     WHERE guild_id = ? AND user_id = ?
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [guildId, userId, days]
  );

  const [topChannels] = await pool.execute(
    `SELECT
       d.channel_id,
       COALESCE(c.channel_name, d.channel_id) AS channel_name,
       COALESCE(SUM(d.message_count), 0)       AS messages,
       COALESCE(SUM(d.voice_seconds), 0)       AS voice_seconds
     FROM dc_activity_daily d
     LEFT JOIN dc_orgchart_config c
       ON d.channel_id = c.channel_id AND d.guild_id = c.guild_id
     WHERE d.guild_id = ? AND d.user_id = ?
       AND d.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY d.channel_id, channel_name
     ORDER BY (SUM(d.message_count) * 10 + SUM(d.voice_seconds)) DESC
     LIMIT ${topN}`,
    [guildId, userId, days]
  );

  const [mentionRow] = await pool.execute(
    `SELECT COUNT(*) AS total_mentions
     FROM dc_activity_mentions
     WHERE guild_id = ? AND user_id = ?
       AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [guildId, userId, days]
  );

  return {
    activity:   activity[0],
    topChannels,
    mentions:   Number(mentionRow[0].total_mentions),
  };
}

/**
 * คืน Set ของ user_ids ที่มี activity ในช่วง days
 * ใช้ filter หา inactive members ฝั่ง command
 */
async function getInactiveMembers(guildId, memberIds, days) {
  if (!memberIds.length) return new Set();

  const placeholders = memberIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT DISTINCT user_id
     FROM dc_activity_daily
     WHERE guild_id = ?
       AND user_id IN (${placeholders})
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       AND (message_count > 0 OR voice_seconds > 0)`,
    [guildId, ...memberIds, days]
  );
  return new Set(rows.map(r => r.user_id));
}

module.exports = {
  getServerOverview,
  getTopChannels,
  getTopMembers,
  getChannelStats,
  getUserStats,
  getInactiveMembers,
};
