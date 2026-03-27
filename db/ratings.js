const pool = require('./index');

/**
 * เพิ่ม rating ใหม่
 * @returns {{ success: boolean, error?: 'self'|'daily_limit' }}
 */
async function addRating({ guildId, targetId, targetName, raterId, raterName, stars, comment }) {
  if (targetId === raterId) return { success: false, error: 'self' };

  // เช็ค daily limit ใน app layer
  const [existing] = await pool.execute(
    `SELECT id FROM dc_user_ratings
     WHERE guild_id = ? AND rater_id = ? AND target_id = ? AND DATE(created_at) = CURDATE()
     LIMIT 1`,
    [guildId, raterId, targetId]
  );
  if (existing.length > 0) return { success: false, error: 'daily_limit' };

  await pool.execute(
    `INSERT INTO dc_user_ratings (guild_id, target_id, target_name, rater_id, rater_name, stars, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [guildId, targetId, targetName, raterId, raterName, stars, comment || null]
  );
  return { success: true };
}

/**
 * Summary: avg, count, การกระจายดาว
 */
async function getRatingSummary(guildId, targetId) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*)             AS total,
       ROUND(AVG(stars), 1) AS avg_stars,
       SUM(stars = 5)       AS s5,
       SUM(stars = 4)       AS s4,
       SUM(stars = 3)       AS s3,
       SUM(stars = 2)       AS s2,
       SUM(stars = 1)       AS s1
     FROM dc_user_ratings
     WHERE guild_id = ? AND target_id = ?`,
    [guildId, targetId]
  );
  return rows[0];
}

/**
 * รายการ comment แบบ paginate (5 ต่อหน้า)
 */
async function getRatingList(guildId, targetId, page = 1, perPage = 5) {
  const offset = (page - 1) * perPage;
  const [rows] = await pool.execute(
    `SELECT
       r.rater_id,
       COALESCE(m.nickname, m.username, r.rater_name) AS rater_name,
       r.stars,
       r.comment,
       r.created_at
     FROM dc_user_ratings r
     LEFT JOIN dc_members m ON m.guild_id = r.guild_id AND m.discord_id = r.rater_id
     WHERE r.guild_id = ? AND r.target_id = ?
     ORDER BY r.created_at DESC
     LIMIT ${perPage} OFFSET ${offset}`,
    [guildId, targetId]
  );
  return rows;
}

/**
 * จำนวน rating ทั้งหมดของ target (ใช้คำนวณ totalPages)
 */
async function getRatingCount(guildId, targetId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM dc_user_ratings WHERE guild_id = ? AND target_id = ?`,
    [guildId, targetId]
  );
  return rows[0].cnt;
}

module.exports = { addRating, getRatingSummary, getRatingList, getRatingCount };