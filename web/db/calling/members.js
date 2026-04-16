import pool from '../index.js'

/**
 * Get member by source_id
 */
export async function getMemberById(sourceId) {
  const [rows] = await pool.query(
    `SELECT * FROM ngs_member_cache WHERE source_id = ?`,
    [sourceId]
  )
  return rows[0] || null
}

/**
 * Get members by district (home_amphure) with pagination
 */
export async function getMembersByDistrict(district, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM ngs_member_cache
     WHERE home_amphure = ?
     ORDER BY first_name ASC
     LIMIT ? OFFSET ?`,
    [district, limit, offset]
  )
  return rows
}

/**
 * Get members by province with pagination
 */
export async function getMembersByProvince(province, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM ngs_member_cache
     WHERE home_province = ?
     ORDER BY home_amphure ASC, first_name ASC
     LIMIT ? OFFSET ?`,
    [province, limit, offset]
  )
  return rows
}

/**
 * Search members by keyword (full_name, source_id, mobile_number)
 */
export async function searchMembers(keyword, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM ngs_member_cache
     WHERE full_name LIKE ? OR mobile_number LIKE ? OR serial LIKE ?
     ORDER BY first_name ASC
     LIMIT ? OFFSET ?`,
    [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit, offset]
  )
  return rows
}

/**
 * Get all members with pagination (required)
 */
export async function getAllMembers(limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM ngs_member_cache
     ORDER BY home_province ASC, home_amphure ASC, first_name ASC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  )
  return rows
}

/**
 * Get total count of members
 */
export async function getMembersCount() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM ngs_member_cache`
  )
  return rows[0]?.count || 0
}

/**
 * Get members in a campaign with assignment + last log info
 */
export async function getMembersInCampaign(campaignId, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       m.*,
       COALESCE(a.assigned_to, '') AS assigned_to,
       COALESCE(a.assigned_by, '') AS assigned_by,
       COALESCE(a.created_at, NULL) AS assignment_date,
       l.called_at AS last_called_at,
       l.status AS last_status,
       l.note AS last_note,
       COUNT(DISTINCT l.id) AS total_calls,
       SUM(CASE WHEN l.status = 'answered' THEN 1 ELSE 0 END) AS answered_count
     FROM calling_campaigns cc
     JOIN ngs_member_cache m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id
     LEFT JOIN calling_logs l
       ON l.campaign_id = cc.id AND l.member_id = m.source_id
     WHERE cc.id = ?
     GROUP BY m.source_id
     ORDER BY m.home_amphure ASC, m.first_name ASC
     LIMIT ? OFFSET ?`,
    [campaignId, limit, offset]
  )
  return rows
}

/**
 * Get member call history in campaign
 */
export async function getMemberCallHistory(campaignId, memberId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_logs
     WHERE campaign_id = ? AND member_id = ?
     ORDER BY called_at DESC`,
    [campaignId, memberId]
  )
  return rows
}

/**
 * Get member's total call history (all campaigns)
 */
export async function getMemberGlobalCallHistory(memberId) {
  const [rows] = await pool.query(
    `SELECT
       cl.*,
       cc.name AS campaign_name
     FROM calling_logs cl
     JOIN calling_campaigns cc ON cc.id = cl.campaign_id
     WHERE cl.member_id = ?
     ORDER BY cl.called_at DESC`,
    [memberId]
  )
  return rows
}
