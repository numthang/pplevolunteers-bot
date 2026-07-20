const pool = require('./index');

/**
 * เพิ่ม rating ใหม่
 * @returns {{ success: boolean, error?: 'self'|'daily_limit' }}
 */
async function addRating({ guildId, targetId, targetName, raterId, raterName, stars, comment }) {
  if (targetId === raterId) return { success: false, error: 'self' };

  // เช็ค daily limit ใน app layer
  const { rows: existing } = await pool.query(
    `SELECT id FROM dc_user_ratings
     WHERE guild_id = $1 AND rater_id = $2 AND target_id = $3 AND created_at::date = CURRENT_DATE
     LIMIT 1`,
    [guildId, raterId, targetId]
  );
  if (existing.length > 0) return { success: false, error: 'daily_limit' };

  await pool.query(
    `INSERT INTO dc_user_ratings (guild_id, target_id, target_name, rater_id, rater_name, stars, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [guildId, targetId, targetName, raterId, raterName, stars, comment || null]
  );
  return { success: true };
}

/**
 * Summary: avg, count, การกระจายดาว
 */
async function getRatingSummary(guildId, targetId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                            AS total,
       ROUND(AVG(stars)::numeric, 1)                       AS avg_stars,
       SUM(CASE WHEN stars = 5 THEN 1 ELSE 0 END)          AS s5,
       SUM(CASE WHEN stars = 4 THEN 1 ELSE 0 END)          AS s4,
       SUM(CASE WHEN stars = 3 THEN 1 ELSE 0 END)          AS s3,
       SUM(CASE WHEN stars = 2 THEN 1 ELSE 0 END)          AS s2,
       SUM(CASE WHEN stars = 1 THEN 1 ELSE 0 END)          AS s1
     FROM dc_user_ratings
     WHERE guild_id = $1 AND target_id = $2`,
    [guildId, targetId]
  );
  return rows[0];
}

/**
 * รายการ comment แบบ paginate (5 ต่อหน้า)
 */
async function getRatingList(guildId, targetId, page = 1, perPage = 5) {
  const offset = (page - 1) * perPage;
  const { rows } = await pool.query(
    `SELECT
       r.rater_id,
       COALESCE(om.nickname, u.username, r.rater_name) AS rater_name,
       r.stars,
       r.comment,
       r.created_at
     FROM dc_user_ratings r
     LEFT JOIN users u ON u.discord_id = r.rater_id
     LEFT JOIN org_members om ON om.user_id = u.id AND om.guild_id = r.guild_id
     WHERE r.guild_id = $1 AND r.target_id = $2
     ORDER BY r.created_at DESC
     LIMIT $3 OFFSET $4`,
    [guildId, targetId, perPage, offset]
  );
  return rows;
}

/**
 * จำนวน rating ทั้งหมดของ target (ใช้คำนวณ totalPages)
 */
async function getRatingCount(guildId, targetId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM dc_user_ratings WHERE guild_id = $1 AND target_id = $2`,
    [guildId, targetId]
  );
  return Number(rows[0].cnt);
}

module.exports = { addRating, getRatingSummary, getRatingList, getRatingCount };
