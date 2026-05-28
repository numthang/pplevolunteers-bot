// db/stat.js
// Queries สำหรับ /stat-* commands

const pool = require('./index');

/**
 * Overview ของ server
 */
async function getServerOverview(guildId, days) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(DISTINCT user_id)            AS active_users,
       COALESCE(SUM(message_count), 0)    AS total_msgs,
       COALESCE(SUM(voice_seconds), 0)    AS total_voice
     FROM dc_activity_daily
     WHERE guild_id = $1
       AND date >= CURRENT_DATE - $2 * INTERVAL '1 day'`,
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

  const { rows } = await pool.query(
    `SELECT
       d.channel_id,
       COALESCE(c.channel_name, d.channel_id) AS channel_name,
       COUNT(DISTINCT d.user_id)               AS contributors,
       COALESCE(SUM(d.message_count), 0)       AS messages,
       COALESCE(SUM(d.voice_seconds), 0)       AS voice_seconds
     FROM dc_activity_daily d
     LEFT JOIN dc_orgchart_config c
       ON d.channel_id = c.channel_id AND d.guild_id = c.guild_id
     WHERE d.guild_id = $1
       AND d.date >= CURRENT_DATE - $2 * INTERVAL '1 day'
     GROUP BY d.channel_id, c.channel_name
     ORDER BY ${orderBy}
     LIMIT $3`,
    [guildId, days, limit]
  );
  return rows;
}

/**
 * Top members ของ server (optional: filter by role)
 * score = messages × 10 + voiceSeconds + mentions × 30
 */
async function getTopMembers(guildId, days, limit = 10, roleMembers = null, sortBy = 'score') {
  const params = [days, guildId, days];

  let sql = `
    SELECT
      d.user_id,
      COALESCE(SUM(d.message_count), 0) AS messages,
      COALESCE(SUM(d.voice_seconds), 0) AS voice_seconds,
      COALESCE((
        SELECT COUNT(*) FROM dc_activity_mentions m
        WHERE m.guild_id = $2
          AND m.user_id = d.user_id
          AND m.timestamp >= NOW() - $1 * INTERVAL '1 day'
      ), 0) AS mentions
    FROM dc_activity_daily d
    WHERE d.guild_id = $2
      AND d.date >= CURRENT_DATE - $3 * INTERVAL '1 day'`;

  if (roleMembers && roleMembers.size > 0) {
    params.push([...roleMembers]);
    sql += ` AND d.user_id = ANY($${params.length})`;
  }

  // PG doesn't allow referencing SELECT aliases inside ORDER BY expressions
  // Wrap with subquery to enable that
  const orderBy = sortBy === 'voice'    ? 'voice_seconds DESC'
    : sortBy === 'messages'             ? 'messages DESC'
    : '(messages * 10 + voice_seconds + mentions * 20) DESC';

  params.push(limit);
  sql = `SELECT * FROM (${sql}
    GROUP BY d.user_id) sub
    ORDER BY ${orderBy}
    LIMIT $${params.length}`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Stats ของ channel
 */
async function getChannelStats(guildId, channelId, days, topN = 5) {
  const { rows: overview } = await pool.query(
    `SELECT
       COUNT(DISTINCT user_id)         AS contributors,
       COALESCE(SUM(message_count), 0) AS total_msgs,
       COALESCE(SUM(voice_seconds), 0) AS total_voice,
       MAX(date)                       AS last_active
     FROM dc_activity_daily
     WHERE guild_id = $1 AND channel_id = $2
       AND date >= CURRENT_DATE - $3 * INTERVAL '1 day'`,
    [guildId, channelId, days]
  );

  const { rows: topUsers } = await pool.query(
    `SELECT
       user_id,
       COALESCE(SUM(message_count), 0) AS messages,
       COALESCE(SUM(voice_seconds), 0) AS voice_seconds
     FROM dc_activity_daily
     WHERE guild_id = $1 AND channel_id = $2
       AND date >= CURRENT_DATE - $3 * INTERVAL '1 day'
     GROUP BY user_id
     ORDER BY (SUM(message_count) * 10 + SUM(voice_seconds)) DESC
     LIMIT $4`,
    [guildId, channelId, days, topN]
  );

  return { overview: overview[0], topUsers };
}

/**
 * Stats ของ user
 */
async function getUserStats(guildId, userId, days, topN = 5) {
  const { rows: activity } = await pool.query(
    `SELECT
       COALESCE(SUM(message_count), 0) AS messages,
       COALESCE(SUM(voice_seconds), 0) AS voice_seconds,
       MAX(date)                       AS last_active
     FROM dc_activity_daily
     WHERE guild_id = $1 AND user_id = $2
       AND date >= CURRENT_DATE - $3 * INTERVAL '1 day'`,
    [guildId, userId, days]
  );

  const { rows: topChannels } = await pool.query(
    `SELECT
       d.channel_id,
       COALESCE(c.channel_name, d.channel_id) AS channel_name,
       COALESCE(SUM(d.message_count), 0)       AS messages,
       COALESCE(SUM(d.voice_seconds), 0)       AS voice_seconds
     FROM dc_activity_daily d
     LEFT JOIN dc_orgchart_config c
       ON d.channel_id = c.channel_id AND d.guild_id = c.guild_id
     WHERE d.guild_id = $1 AND d.user_id = $2
       AND d.date >= CURRENT_DATE - $3 * INTERVAL '1 day'
     GROUP BY d.channel_id, c.channel_name
     ORDER BY (SUM(d.message_count) * 10 + SUM(d.voice_seconds)) DESC
     LIMIT $4`,
    [guildId, userId, days, topN]
  );

  const { rows: mentionRow } = await pool.query(
    `SELECT COUNT(*) AS total_mentions
     FROM dc_activity_mentions
     WHERE guild_id = $1 AND user_id = $2
       AND timestamp >= NOW() - $3 * INTERVAL '1 day'`,
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

  const { rows } = await pool.query(
    `SELECT DISTINCT user_id
     FROM dc_activity_daily
     WHERE guild_id = $1
       AND user_id = ANY($2)
       AND date >= CURRENT_DATE - $3 * INTERVAL '1 day'
       AND (message_count > 0 OR voice_seconds > 0)`,
    [guildId, memberIds, days]
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
