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
  const { amphure, tier, status, assignedTo, rsvp, name } = filters
  const [rows] = await pool.query(
    `SELECT
       m.*,
       COALESCE(t.tier, 'D') AS tier,
       COALESCE(a.assigned_to, '') AS assigned_to,
       COALESCE(a.assigned_by, '') AS assigned_by,
       COALESCE(a.created_at, NULL) AS assignment_date,
       a.rsvp,
       l.called_at AS last_called_at,
       l.status AS last_status,
       l.note AS last_note,
       COUNT(DISTINCT l.id) AS total_calls,
       SUM(CASE WHEN l.status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
       CASE WHEN a.id IS NOT NULL THEN 'assigned' ELSE 'unassigned' END AS member_status,
       dc.discord_id,
       dc.username AS discord_username
     FROM act_event_cache cc
     JOIN ngs_member_cache m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id
     LEFT JOIN calling_logs l
       ON l.campaign_id = cc.id AND l.member_id = m.source_id
     LEFT JOIN dc_members dc ON dc.serial = m.serial AND dc.guild_id = ?
     WHERE cc.id = ? AND cc.type = 'campaign'
       AND (? IS NULL OR m.home_amphure = ?)
       AND (? IS NULL OR COALESCE(t.tier, 'D') = ?)
       AND (? IS NULL OR a.assigned_to = ?)
       AND (? IS NULL OR a.rsvp = ?)
       AND (? IS NULL OR m.full_name LIKE ?)
     GROUP BY m.source_id
     HAVING (? IS NULL OR member_status = ?)
     ORDER BY m.home_amphure ASC, m.first_name ASC, m.source_id ASC
     LIMIT ? OFFSET ?`,
    [
      process.env.GUILD_ID,
      campaignId,
      amphure || null, amphure || null,
      tier || null, tier || null,
      assignedTo || null, assignedTo || null,
      rsvp || null, rsvp || null,
      name || null, name ? `%${name}%` : null,
      status || null, status || null,
      limit, offset
    ]
  )
  return rows
}

export async function getMembersInCampaignStats(campaignId) {
  const BASE = `
    FROM act_event_cache cc
    JOIN ngs_member_cache m ON (cc.province IS NULL OR m.home_province = cc.province)
    WHERE cc.id = ? AND cc.type = 'campaign'`

  const [[mainRows], [districtRows], [tierRows], [assigneeRows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(DISTINCT m.source_id) AS total,
         SUM(CASE WHEN lc.log_count > 0 THEN 1 ELSE 0 END) AS called,
         SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
         SUM(CASE WHEN a.id IS NULL THEN 1 ELSE 0 END) AS unassigned
       FROM act_event_cache cc
       JOIN ngs_member_cache m ON (cc.province IS NULL OR m.home_province = cc.province)
       LEFT JOIN calling_assignments a ON a.campaign_id = cc.id AND a.member_id = m.source_id
       LEFT JOIN (
         SELECT member_id, COUNT(*) AS log_count
         FROM calling_logs WHERE campaign_id = ?
         GROUP BY member_id
       ) lc ON lc.member_id = m.source_id
       WHERE cc.id = ? AND cc.type = 'campaign'`,
      [campaignId, campaignId]
    ),
    pool.query(
      `SELECT COALESCE(m.home_amphure, '') AS district, COUNT(DISTINCT m.source_id) AS count
       ${BASE} GROUP BY district ORDER BY district`,
      [campaignId]
    ),
    pool.query(
      `SELECT COALESCE(t.tier, 'D') AS tier, COUNT(DISTINCT m.source_id) AS count
       FROM act_event_cache cc
       JOIN ngs_member_cache m ON (cc.province IS NULL OR m.home_province = cc.province)
       LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id
       WHERE cc.id = ? AND cc.type = 'campaign'
       GROUP BY tier`,
      [campaignId]
    ),
    pool.query(
      `SELECT a.assigned_to, COUNT(DISTINCT m.source_id) AS count
       FROM act_event_cache cc
       JOIN ngs_member_cache m ON (cc.province IS NULL OR m.home_province = cc.province)
       JOIN calling_assignments a ON a.campaign_id = cc.id AND a.member_id = m.source_id
       WHERE cc.id = ? AND cc.type = 'campaign'
       GROUP BY a.assigned_to`,
      [campaignId]
    ),
  ])

  const row = mainRows[0] || {}

  const districtCounts = {}
  for (const r of districtRows) districtCounts[r.district] = Number(r.count)

  const tierCounts = {}
  for (const r of tierRows) tierCounts[r.tier] = Number(r.count)

  const assigneeCounts = assigneeRows.map(r => ({ id: r.assigned_to, count: Number(r.count) }))

  return {
    total: Number(row.total) || 0,
    called: Number(row.called) || 0,
    assigned: Number(row.assigned) || 0,
    unassigned: Number(row.unassigned) || 0,
    districts: districtRows.map(r => r.district),
    districtCounts,
    tierCounts,
    assigneeCounts,
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
 * Get campaigns that have assignments for a specific user
 */
export async function getMyCampaigns(discordId) {
  const [rows] = await pool.query(
    `SELECT
       ec.id, ec.name, ec.province,
       COUNT(a.member_id) AS assigned_count,
       SUM(CASE WHEN camp_stats.camp_calls > 0 THEN 1 ELSE 0 END) AS called_count
     FROM calling_assignments a
     JOIN act_event_cache ec ON ec.id = a.campaign_id AND ec.type = 'campaign'
     LEFT JOIN (
       SELECT campaign_id, member_id, COUNT(*) AS camp_calls
       FROM calling_logs GROUP BY campaign_id, member_id
     ) camp_stats ON camp_stats.campaign_id = a.campaign_id AND camp_stats.member_id = a.member_id
     WHERE a.assigned_to = ?
       AND (ec.event_date IS NULL OR ec.event_date >= CURDATE())
     GROUP BY ec.id
     ORDER BY ec.name ASC`,
    [discordId]
  )
  return rows
}

/**
 * Get members assigned to a specific caller with call status, latest note, and stats
 * call_status: 'called' = has logs in assigned campaign | 'pending' = no logs yet
 */
export async function getMyAssignedMembers(discordId, { campaignId, status, rsvp, limit = 200, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT
         m.*,
         COALESCE(t.tier, 'D') AS tier,
         a.campaign_id,
         a.created_at AS assigned_at,
         a.rsvp,
         ec.name AS campaign_name,
         ec.description AS campaign_description,
         ec.event_date,
         COALESCE(all_stats.total_calls, 0) AS total_calls,
         COALESCE(all_stats.answered_count, 0) AS answered_count,
         COALESCE(camp_stats.camp_calls, 0) AS camp_calls,
         CASE WHEN COALESCE(camp_stats.camp_calls, 0) > 0 THEN 'called' ELSE 'pending' END AS call_status,
         latest_log.note AS latest_note,
         latest_log.status AS latest_log_status,
         latest_log.called_at AS latest_called_at,
         dc.discord_id,
         dc.username AS discord_username
       FROM calling_assignments a
       JOIN ngs_member_cache m ON m.source_id = a.member_id
       LEFT JOIN calling_member_tiers t ON t.member_id = a.member_id
       LEFT JOIN act_event_cache ec ON ec.id = a.campaign_id AND ec.type = 'campaign'
       LEFT JOIN dc_members dc ON dc.serial = m.serial AND dc.guild_id = ?
       LEFT JOIN (
         SELECT member_id,
           COUNT(*) AS total_calls,
           SUM(status = 'answered') AS answered_count
         FROM calling_logs GROUP BY member_id
       ) all_stats ON all_stats.member_id = a.member_id
       LEFT JOIN (
         SELECT campaign_id, member_id, COUNT(*) AS camp_calls
         FROM calling_logs GROUP BY campaign_id, member_id
       ) camp_stats ON camp_stats.campaign_id = a.campaign_id AND camp_stats.member_id = a.member_id
       LEFT JOIN (
         SELECT l.*
         FROM calling_logs l
         INNER JOIN (
           SELECT member_id, MAX(id) AS max_id FROM calling_logs GROUP BY member_id
         ) lm ON lm.member_id = l.member_id AND lm.max_id = l.id
       ) latest_log ON latest_log.member_id = a.member_id
       WHERE a.assigned_to = ?
         AND (? IS NULL OR a.campaign_id = ?)
         AND (? IS NULL OR a.rsvp = ?)
     ) sub
     WHERE (? IS NULL OR call_status = ?)
       AND (event_date IS NULL OR event_date >= CURDATE())
     ORDER BY
       CASE WHEN call_status = 'pending' THEN 0 ELSE 1 END ASC,
       CASE tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC,
       home_amphure ASC,
       first_name ASC
     LIMIT ? OFFSET ?`,
    [process.env.GUILD_ID, discordId, campaignId || null, campaignId || null, rsvp || null, rsvp || null, status || null, status || null, limit, offset]
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
