const pool = require('./index');

/**
 * เพิ่ม rating ใหม่
 * @returns {{ success: boolean, error?: 'self'|'daily_limit' }}
 */
/* async function addRating({ targetId, targetName, raterId, raterName, stars, comment }) {
  if (targetId === raterId) return { success: false, error: 'self' };

  try {
    await pool.execute(
      `INSERT INTO user_ratings (target_id, target_name, rater_id, rater_name, stars, comment, created_date)
      VALUES (?, ?, ?, ?, ?, ?, CURDATE())`,
      [targetId, targetName, raterId, raterName, stars, comment || null]
    );
    return { success: true };
  } catch (err) {
    // Duplicate entry = daily limit hit (UNIQUE KEY uq_daily)
    if (err.code === 'ER_DUP_ENTRY') return { success: false, error: 'daily_limit' };
    throw err;
  }
} */
async function addRating({ targetId, targetName, raterId, raterName, stars, comment }) {
  if (targetId === raterId) return { success: false, error: 'self' };

  // เช็ค daily limit ใน app layer
  const [existing] = await pool.execute(
    `SELECT id FROM user_ratings
     WHERE rater_id = ? AND target_id = ? AND DATE(created_at) = CURDATE()
     LIMIT 1`,
    [raterId, targetId]
  );
  if (existing.length > 0) return { success: false, error: 'daily_limit' };

  await pool.execute(
    `INSERT INTO user_ratings (target_id, target_name, rater_id, rater_name, stars, comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [targetId, targetName, raterId, raterName, stars, comment || null]
  );
  return { success: true };
}
/**
 * Summary: avg, count, การกระจายดาว
 */
async function getRatingSummary(targetId) {
  const [rows] = await pool.execute(
    `SELECT
       COUNT(*)                        AS total,
       ROUND(AVG(stars), 1)            AS avg_stars,
       SUM(stars = 5)                  AS s5,
       SUM(stars = 4)                  AS s4,
       SUM(stars = 3)                  AS s3,
       SUM(stars = 2)                  AS s2,
       SUM(stars = 1)                  AS s1
     FROM user_ratings
     WHERE target_id = ?`,
    [targetId]
  );
  return rows[0];
}

/**
 * รายการ comment แบบ paginate (5 ต่อหน้า)
 */
async function getRatingList(targetId, page = 1, perPage = 5) {
  const offset = (page - 1) * perPage;
  const [rows] = await pool.execute(
    `SELECT rater_id, rater_name, stars, comment, created_at
     FROM user_ratings
     WHERE target_id = ?
     ORDER BY created_at DESC
     LIMIT ${perPage} OFFSET ${offset}`,
    [targetId]
  );
  return rows;
}

/**
 * จำนวน rating ทั้งหมดของ target (ใช้คำนวณ totalPages)
 */
async function getRatingCount(targetId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM user_ratings WHERE target_id = ?`,
    [targetId]
  );
  return rows[0].cnt;
}

module.exports = { addRating, getRatingSummary, getRatingList, getRatingCount };
