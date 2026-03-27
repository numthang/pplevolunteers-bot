const pool = require('./index');

/**
 * เพิ่ม report ใหม่
 */
async function addReport({ guildId, targetId, targetName, reporterId, reporterName, category, detail, evidence, isAnonymous }) {
  const [result] = await pool.execute(
    `INSERT INTO dc_user_reports
       (guild_id, target_id, target_name, reporter_id, reporter_name, category, detail, evidence, is_anonymous)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guildId,
      targetId,
      targetName,
      isAnonymous ? null : reporterId,
      isAnonymous ? null : reporterName,
      category,
      detail,
      evidence || null,
      isAnonymous ? 1 : 0,
    ]
  );
  return result.insertId;
}

/**
 * ดูรายการ report กรองตาม status (optional) + paginate
 */
async function getReportList(guildId, status = null, page = 1, perPage = 5) {
  const offset = (page - 1) * perPage;
  const conditions = ['guild_id = ?'];
  const params = [guildId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const [rows] = await pool.execute(
    `SELECT id, target_id, target_name, category, is_anonymous,
            reporter_id, reporter_name, status, created_at
     FROM dc_user_reports
     ${where}
     ORDER BY created_at DESC
     LIMIT ${perPage} OFFSET ${offset}`,
    params
  );
  return rows;
}

/**
 * จำนวน report ทั้งหมด (ใช้คำนวณ totalPages)
 */
async function getReportCount(guildId, status = null) {
  const conditions = ['guild_id = ?'];
  const params = [guildId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM dc_user_reports ${where}`,
    params
  );
  return rows[0].cnt;
}

/**
 * ดู report รายละเอียดตาม id (scoped ตาม guild)
 */
async function getReportById(guildId, id) {
  const [rows] = await pool.execute(
    `SELECT * FROM dc_user_reports WHERE guild_id = ? AND id = ?`,
    [guildId, id]
  );
  return rows[0] ?? null;
}

/**
 * อัพเดท status + mod_note
 */
async function updateReport(guildId, id, { status, modNote }) {
  await pool.execute(
    `UPDATE dc_user_reports SET status = ?, mod_note = ? WHERE guild_id = ? AND id = ?`,
    [status, modNote || null, guildId, id]
  );
}

module.exports = { addReport, getReportList, getReportCount, getReportById, updateReport };