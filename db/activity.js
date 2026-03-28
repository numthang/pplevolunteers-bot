// db/activity.js
const pool = require('./index');

/**
 * Upsert activity รายวัน (aggregate)
 * เรียกทุกครั้งที่มี message หรือ voice session จบ
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
 * ใช้คำนวณ score สำหรับ orgchart
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
 * ดึง last active ของ user (ล่าสุดที่มี activity ใน guild นี้)
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
 * บันทึก mention และ replied_at (ถ้ามี)
 */
async function addMention({ guildId, userId, mentionedBy, channelId, timestamp }) {
  await pool.execute(
    `INSERT INTO dc_activity_mentions (guild_id, user_id, mentioned_by, channel_id, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [guildId, userId, mentionedBy, channelId, timestamp]
  );
}

/**
 * อัปเดต replied_at เมื่อ user ตอบกลับใน channel ที่ถูก mention
 * จับคู่กับ mention ล่าสุดที่ยังไม่ได้ reply ใน channel นั้น
 */
async function markReplied({ guildId, userId, channelId, repliedAt }) {
  await pool.execute(
    `UPDATE dc_activity_mentions
     SET replied_at = ?
     WHERE guild_id = ? AND user_id = ? AND channel_id = ?
       AND replied_at IS NULL
     ORDER BY timestamp DESC
     LIMIT 1`,
    [repliedAt, guildId, userId, channelId]
  );
}

/**
 * ดึง response stats ของ user
 * reply_rate = replied / total_mentions
 * avg_response_seconds = เฉลี่ยเวลาที่ใช้ตอบ
 */
async function getMentionStats(guildId, userId, days = 30) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*) AS total_mentions,
       SUM(replied_at IS NOT NULL) AS replied,
       AVG(CASE WHEN replied_at IS NOT NULL
           THEN TIMESTAMPDIFF(SECOND, timestamp, replied_at)
           END) AS avg_response_seconds
     FROM dc_activity_mentions
     WHERE guild_id = ? AND user_id = ?
       AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [guildId, userId, days]
  );
  return {
    totalMentions: Number(rows[0].total_mentions),
    replied: Number(rows[0].replied),
    replyRate: rows[0].total_mentions > 0 ? (rows[0].replied / rows[0].total_mentions) : 0,
    avgResponseSeconds: rows[0].avg_response_seconds ? Math.round(rows[0].avg_response_seconds) : null,
  };
}

module.exports = {
  upsertDailyActivity,
  getUserActivity,
  getLastActive,
  addMention,
  markReplied,
  getMentionStats,
};
