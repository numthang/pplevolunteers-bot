// db/activity.js
const pool = require('./index');

/**
 * Upsert activity รายวัน (aggregate)
 */
async function upsertDailyActivity({ guildId, userId, channelId, date, messageDelta = 0, voiceDelta = 0 }) {
  await pool.query(
    `INSERT INTO dc_activity_daily (guild_id, user_id, channel_id, date, message_count, voice_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (guild_id, user_id, channel_id, date) DO UPDATE SET
       message_count = dc_activity_daily.message_count + EXCLUDED.message_count,
       voice_seconds = dc_activity_daily.voice_seconds + EXCLUDED.voice_seconds`,
    [guildId, userId, channelId, date, messageDelta, voiceDelta]
  );
}

/**
 * ดึง activity รวมของ user ใน channels ที่กำหนด
 */
async function getUserActivity(guildId, userId, channelIds, days = 30) {
  if (!channelIds.length) return { messages: 0, voiceSeconds: 0 };

  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(message_count), 0) AS messages,
       COALESCE(SUM(voice_seconds), 0) AS voice_seconds
     FROM dc_activity_daily
     WHERE guild_id = $1
       AND user_id = $2
       AND channel_id = ANY($3)
       AND date >= CURRENT_DATE - $4 * INTERVAL '1 day'`,
    [guildId, userId, channelIds, days]
  );
  return { messages: Number(rows[0].messages), voiceSeconds: Number(rows[0].voice_seconds) };
}

/**
 * ดึง last active ของ user
 */
async function getLastActive(guildId, userId) {
  const { rows } = await pool.query(
    `SELECT MAX(date) AS last_date
     FROM dc_activity_daily
     WHERE guild_id = $1 AND user_id = $2 AND (message_count > 0 OR voice_seconds > 0)`,
    [guildId, userId]
  );
  return rows[0]?.last_date ?? null;
}

/**
 * บันทึก mention
 */
async function addMention({ guildId, userId, mentionedBy, channelId, timestamp }) {
  await pool.query(
    `INSERT INTO dc_activity_mentions (guild_id, user_id, mentioned_by, channel_id, timestamp)
     VALUES ($1, $2, $3, $4, $5)`,
    [guildId, userId, mentionedBy, channelId, timestamp]
  );
}

/**
 * นับจำนวนครั้งที่ user ถูก mention ใน channels ที่กำหนด
 */
async function getMentionCount(guildId, userId, channelIds, days = 30) {
  if (!channelIds.length) return 0;

  const { rows } = await pool.query(
    `SELECT COUNT(*) AS total
     FROM dc_activity_mentions
     WHERE guild_id = $1
       AND user_id = $2
       AND channel_id = ANY($3)
       AND timestamp >= NOW() - $4 * INTERVAL '1 day'`,
    [guildId, userId, channelIds, days]
  );
  return Number(rows[0].total);
}

module.exports = {
  upsertDailyActivity,
  getUserActivity,
  getLastActive,
  addMention,
  getMentionCount,
};
