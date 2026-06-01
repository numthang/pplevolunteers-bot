const pool = require('./index');

/**
 * เพิ่ม report ใหม่
 */
async function addReport({ guildId, targetId, targetName, reporterId, reporterName, category, detail, evidence, isAnonymous }) {
  const { rows } = await pool.query(
    `INSERT INTO dc_user_reports
       (guild_id, target_id, target_name, reporter_id, reporter_name, category, detail, evidence, is_anonymous)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      guildId,
      targetId,
      targetName,
      isAnonymous ? null : reporterId,
      isAnonymous ? null : reporterName,
      category,
      detail,
      evidence || null,
      isAnonymous ? true : false,
    ]
  );
  return rows[0].id;
}

/**
 * ดูรายการ report กรองตาม status (optional) + paginate
 */
async function getReportList(guildId, status = null, page = 1, perPage = 5) {
  const offset = (page - 1) * perPage;
  const params = [guildId];
  let where = `WHERE guild_id = $1`;

  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  params.push(perPage, offset);
  const { rows } = await pool.query(
    `SELECT id, target_id, target_name, category, is_anonymous,
            reporter_id, reporter_name, status, created_at
     FROM dc_user_reports
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/**
 * จำนวน report ทั้งหมด (ใช้คำนวณ totalPages)
 */
async function getReportCount(guildId, status = null) {
  const params = [guildId];
  let where = `WHERE guild_id = $1`;

  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM dc_user_reports ${where}`,
    params
  );
  return Number(rows[0].cnt);
}

/**
 * ดู report รายละเอียดตาม id (scoped ตาม guild)
 */
async function getReportById(guildId, id) {
  const { rows } = await pool.query(
    `SELECT * FROM dc_user_reports WHERE guild_id = $1 AND id = $2`,
    [guildId, id]
  );
  return rows[0] ?? null;
}

/**
 * อัพเดท status + mod_note
 */
async function updateReport(guildId, id, { status, modNote }) {
  await pool.query(
    `UPDATE dc_user_reports SET status = $1, mod_note = $2 WHERE guild_id = $3 AND id = $4`,
    [status, modNote || null, guildId, id]
  );
}

module.exports = { addReport, getReportList, getReportCount, getReportById, updateReport };
