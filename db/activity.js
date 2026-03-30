// db/activity.js
const pool = require('./index');

/**
 * Upsert activity รายวัน (aggregate)
 */
async function upsertDailyActivity({ guildId, userId, channelId, date, messageDelta = 0, voiceDelta = 0 }) {
  await pool.execute(
    `INSERT INTO dc_activity_daily (guild_id, user_id, channel_id, date, message_count, voice_seconds)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       message_count = message_count + VALUES(message_count),
       voice_seconds = voice_seconds + VALUES(voice_seconds)`,
    [guildId, userId, channelId, date, messageDelta, voiceDelta]
  );
}

/**
 * ดึง activity รวมของ user ใน channels ที่กำหนด
 */
async function getUserActivity(guildId, userId, channelIds, days = 30) {
  if (!channelIds.length) return { messages: 0, voiceSeconds: 0 };

  const placeholders = channelIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(message_count), 0) AS messages,
       COALESCE(SUM(voice_seconds), 0) AS voice_seconds
     FROM dc_activity_daily
     WHERE guild_id = ?
       AND user_id = ?
       AND channel_id IN (${placeholders})
       AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [guildId, userId, ...channelIds, days]
  );
  return { messages: Number(rows[0].messages), voiceSeconds: Number(rows[0].voice_seconds) };
}

/**
 * ดึง last active ของ user
 */
async function getLastActive(guildId, userId) {
  const [rows] = await pool.execute(
    `SELECT MAX(date) AS last_date
     FROM dc_activity_daily
     WHERE guild_id = ? AND user_id = ? AND (message_count > 0 OR voice_seconds > 0)`,
    [guildId, userId]
  );
  return rows[0]?.last_date ?? null;
}

/**
 * บันทึก mention
 */
async function addMention({ guildId, userId, mentionedBy, channelId, timestamp }) {
  await pool.execute(
    `INSERT INTO dc_activity_mentions (guild_id, user_id, mentioned_by, channel_id, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [guildId, userId, mentionedBy, channelId, timestamp]
  );
}

/**
 * นับจำนวนครั้งที่ user ถูก mention ใน channels ที่กำหนด
 */
async function getMentionCount(guildId, userId, channelIds, days = 30) {
  if (!channelIds.length) return 0;

  const placeholders = channelIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM dc_activity_mentions
     WHERE guild_id = ?
       AND user_id = ?
       AND channel_id IN (${placeholders})
       AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [guildId, userId, ...channelIds, days]
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