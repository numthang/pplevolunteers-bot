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
 * Get all members with pagination + call stats (required)
 */
export async function getAllMembers(limit = 100, offset = 0) {
  const [rows] = await pool.query(
    `SELECT
       m.*,
       t.tier,
       COUNT(DISTINCT l.id) AS total_calls,
       MAX(l.called_at) AS last_called_at
     FROM ngs_member_cache m
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id
     LEFT JOIN calling_logs l ON l.member_id = m.source_id
     GROUP BY m.source_id
     ORDER BY m.home_province ASC, m.home_amphure ASC, m.first_name ASC
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
 * Get members in a campaign with assignment + last log info + computed status
 * Status: 'called' (has calls) | 'assigned' (assigned to someone) | 'unassigned'
 */
export async function getMembersInCampaign(campaignId, filters = {}, limit = 100, offset = 0) {
  const { amphure, tier, status, assignedTo } = filters
  const [rows] = await pool.query(
    `SELECT
       m.*,
       COALESCE(t.tier, 'D') AS tier,
       COALESCE(a.assigned_to, '') AS assigned_to,
       COALESCE(a.assigned_by, '') AS assigned_by,
       COALESCE(a.created_at, NULL) AS assignment_date,
       l.called_at AS last_called_at,
       l.status AS last_status,
       l.note AS last_note,
       COUNT(DISTINCT l.id) AS total_calls,
       SUM(CASE WHEN l.status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
       CASE
         WHEN COUNT(DISTINCT l.id) > 0 THEN 'called'
         WHEN a.id IS NOT NULL THEN 'assigned'
         ELSE 'unassigned'
       END AS member_status
     FROM act_event_cache cc
     JOIN ngs_member_cache m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id
     LEFT JOIN calling_logs l
       ON l.campaign_id = cc.id AND l.member_id = m.source_id
     WHERE cc.id = ? AND cc.type = 'campaign'
       AND (? IS NULL OR m.home_amphure = ?)
       AND (? IS NULL OR COALESCE(t.tier, 'D') = ?)
       AND (? IS NULL OR a.assigned_to = ?)
     GROUP BY m.source_id
     HAVING (? IS NULL OR member_status = ?)
     ORDER BY m.home_amphure ASC, m.first_name ASC
     LIMIT ? OFFSET ?`,
    [
      campaignId,
      amphure || null, amphure || null,
      tier || null, tier || null,
      assignedTo || null, assignedTo || null,
      status || null, status || null,
      limit, offset
    ]
  )
  return rows
}

export async function getMembersInCampaignStats(campaignId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(DISTINCT m.source_id) AS total,
       SUM(CASE WHEN lc.log_count > 0 THEN 1 ELSE 0 END) AS called,
       SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
       SUM(CASE WHEN lc.log_count = 0 AND a.id IS NULL THEN 1 ELSE 0 END) AS unassigned,
       GROUP_CONCAT(DISTINCT m.home_amphure ORDER BY m.home_amphure SEPARATOR '|') AS districts_raw
     FROM act_event_cache cc
     JOIN ngs_member_cache m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id
     LEFT JOIN (
       SELECT member_id, COUNT(*) AS log_count
       FROM calling_logs WHERE campaign_id = ?
       GROUP BY member_id
     ) lc ON lc.member_id = m.source_id
     WHERE cc.id = ? AND cc.type = 'campaign'`,
    [campaignId, campaignId]
  )
  const row = rows[0] || { total: 0, called: 0, assigned: 0, unassigned: 0 }
  return {
    total: row.total || 0,
    called: row.called || 0,
    assigned: row.assigned || 0,
    unassigned: row.unassigned || 0,
    districts: row.districts_raw ? row.districts_raw.split('|') : []
  }
}

export async function getUnassignedMemberIds(campaignId) {
  const [rows] = await pool.query(
    `SELECT m.source_id
     FROM act_event_cache cc
     JOIN ngs_member_cache m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id
     LEFT JOIN calling_logs l
       ON l.campaign_id = cc.id AND l.member_id = m.source_id
     WHERE cc.id = ? AND cc.type = 'campaign'
     GROUP BY m.source_id
     HAVING COUNT(DISTINCT l.id) = 0 AND MAX(a.id) IS NULL
     ORDER BY m.home_amphure ASC, m.first_name ASC`,
    [campaignId]
  )
  return rows.map(r => r.source_id)
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
     JOIN act_event_cache cc ON cc.id = cl.campaign_id AND cc.type = 'campaign'
     WHERE cl.member_id = ?
     ORDER BY cl.called_at DESC`,
    [memberId]
  )
  return rows
}
