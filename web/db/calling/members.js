import pool from '../index.js'

/**
 * Get member by ID
 */
export async function getMemberById(memberId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_members_bq WHERE member_id = ?`,
    [memberId]
  )
  return rows[0] || null
}

/**
 * Get members by district with pagination
 */
export async function getMembersByDistrict(district, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_members_bq
     WHERE district = ?
     ORDER BY name ASC
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
    `SELECT * FROM calling_members_bq
     WHERE province = ?
     ORDER BY district ASC, name ASC
     LIMIT ? OFFSET ?`,
    [province, limit, offset]
  )
  return rows
}

/**
 * Search members by keyword (name, member_id, phone)
 */
export async function searchMembers(keyword, limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_members_bq
     WHERE name LIKE ? OR member_id LIKE ? OR phone LIKE ?
     ORDER BY name ASC
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
    `SELECT * FROM calling_members_bq
     ORDER BY province ASC, district ASC, name ASC
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
    `SELECT COUNT(*) AS count FROM calling_members_bq`
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
     JOIN calling_members_bq m
       ON (cc.province IS NULL OR m.province = cc.province)
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.member_id
     LEFT JOIN calling_logs l
       ON l.campaign_id = cc.id AND l.member_id = m.member_id
     WHERE cc.id = ?
     GROUP BY m.member_id
     ORDER BY m.district ASC, m.name ASC
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
