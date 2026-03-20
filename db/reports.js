const pool = require('./index');

/**
 * เพิ่ม report ใหม่
 */
async function addReport({ targetId, targetName, reporterId, reporterName, category, detail, evidence, isAnonymous }) {
  const [result] = await pool.execute(
    `INSERT INTO user_reports
       (target_id, target_name, reporter_id, reporter_name, category, detail, evidence, is_anonymous)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
async function getReportList(status = null, page = 1, perPage = 5) {
  const offset = (page - 1) * perPage;
  const where  = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];

  const [rows] = await pool.execute(
    `SELECT id, target_id, target_name, category, is_anonymous,
            reporter_id, reporter_name, status, created_at
     FROM user_reports
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
async function getReportCount(status = null) {
  const where  = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM user_reports ${where}`,
    params
  );
  return rows[0].cnt;
}

/**
 * ดู report รายละเอียดตาม id
 */
async function getReportById(id) {
  const [rows] = await pool.execute(
    `SELECT * FROM user_reports WHERE id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * อัพเดท status + mod_note
 */
async function updateReport(id, { status, modNote }) {
  await pool.execute(
    `UPDATE user_reports SET status = ?, mod_note = ? WHERE id = ?`,
    [status, modNote || null, id]
  );
}

module.exports = { addReport, getReportList, getReportCount, getReportById, updateReport };
