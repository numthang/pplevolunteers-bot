import pool from '../index.js'

export async function getMemberById(orgId, sourceId) {
  const { rows } = await pool.query(
    `SELECT * FROM cache_pple_member WHERE org_id = $1 AND source_id = $2`,
    [orgId, sourceId]
  )
  return rows[0] || null
}

export async function getMembersByDistrict(orgId, district, limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM cache_pple_member
     WHERE org_id = $1 AND home_amphure = $2
     ORDER BY first_name ASC
     LIMIT $3 OFFSET $4`,
    [orgId, district, limit, offset]
  )
  return rows
}

export async function getMembersByProvince(orgId, province, limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM cache_pple_member
     WHERE org_id = $1 AND home_province = $2
     ORDER BY home_amphure ASC, first_name ASC
     LIMIT $3 OFFSET $4`,
    [orgId, province, limit, offset]
  )
  return rows
}

export async function searchMembers(orgId, keyword, limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM cache_pple_member
     WHERE org_id = $1 AND (full_name ILIKE $2 OR mobile_number ILIKE $3 OR serial ILIKE $4)
     ORDER BY first_name ASC
     LIMIT $5 OFFSET $6`,
    [orgId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit, offset]
  )
  return rows
}

export async function getAllMembers(orgId, limit = 100, offset = 0) {
  const { rows } = await pool.query(
    `SELECT
       m.*,
       t.tier,
       t.flag,
       COUNT(DISTINCT l.id) AS total_calls,
       MAX(l.called_at) AS last_called_at
     FROM cache_pple_member m
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id::text AND t.contact_type = 'member'
     LEFT JOIN calling_logs l ON l.member_id = m.source_id::text AND l.contact_type = 'member'
     WHERE m.org_id = $1
     GROUP BY m.source_id, t.tier, t.flag
     ORDER BY m.home_province ASC, m.home_amphure ASC, m.first_name ASC
     LIMIT $2 OFFSET $3`,
    [orgId, limit, offset]
  )
  return rows
}

export async function getMembersCount(orgId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM cache_pple_member WHERE org_id = $1`,
    [orgId]
  )
  return Number(rows[0]?.count) || 0
}

export async function getMembersInCampaign(orgId, campaignId, filters = {}, limit = 100, offset = 0) {
  const { amphure, subdistricts, tier, status, assignedTo, rsvp, name, expiry, called, sort, sms } = filters

  const needAllTimeCalls = sort === 'least_called'

  const params = [orgId, campaignId]
  // $1: org_id, $2: campaign_id

  params.push(amphure || null)
  const amphureIdx = params.length
  // $3: amphure

  let query = `SELECT
       m.*,
       COALESCE(t.tier::text, 'D') AS tier,
       t.flag,
       a.assigned_to,
       a.assigned_by,
       COALESCE(a.created_at, NULL) AS assignment_date,
       a.rsvp,
       ll.called_at AS last_called_at,
       ll.status AS last_status,
       ll.note AS last_note,
       COALESCE(ls.total_calls, 0) AS total_calls,
       COALESCE(ls.answered_count, 0) AS answered_count,
       COALESCE(ls.sms_count, 0) AS sms_count,
       CASE WHEN a.id IS NOT NULL THEN 'assigned' ELSE 'unassigned' END AS member_status,
       u.discord_id,
       u.username AS discord_username,
       dc.avatar AS discord_avatar${needAllTimeCalls ? `,
       COALESCE(atl.all_time_calls, 0) AS all_time_calls` : ''}
     FROM cache_pple_event cc
     JOIN cache_pple_member m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id::text AND t.contact_type = 'member'
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id::text AND a.contact_type = 'member'
     LEFT JOIN LATERAL (
       SELECT called_at, status, note
       FROM calling_logs
       WHERE campaign_id = cc.id AND member_id = m.source_id::text AND contact_type = 'member'
       ORDER BY called_at DESC LIMIT 1
     ) ll ON TRUE
     LEFT JOIN (
       SELECT campaign_id, member_id,
         COUNT(*) AS total_calls,
         SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
         SUM(CASE WHEN status IN ('sms_sent','sms_delivered') THEN 1 ELSE 0 END) AS sms_count
       FROM calling_logs WHERE contact_type = 'member'
       GROUP BY campaign_id, member_id
     ) ls ON ls.campaign_id = cc.id AND ls.member_id = m.source_id::text
     LEFT JOIN LATERAL (SELECT om.avatar, om.user_id FROM org_members om WHERE om.serial = m.serial AND om.org_id = $1 LIMIT 1) dc ON true
     LEFT JOIN users u ON u.id = dc.user_id${needAllTimeCalls ? `
     LEFT JOIN (SELECT member_id, COUNT(*) AS all_time_calls FROM calling_logs WHERE contact_type = 'member' GROUP BY member_id) atl
       ON atl.member_id = m.source_id::text` : ''}
     WHERE cc.id = $2 AND cc.type IN ('campaign', 'event')
       AND m.mobile_number IS NOT NULL
       AND m.org_id = $1
       AND ($${amphureIdx}::text IS NULL OR m.home_amphure = $${amphureIdx})`

  if (subdistricts && subdistricts.length > 0) {
    params.push(subdistricts)
    query += ` AND m.home_district = ANY($${params.length})`
  }

  params.push(tier || null)
  const tierIdx = params.length
  params.push(assignedTo || null)
  const assignedToIdx = params.length
  params.push(rsvp || null)
  const rsvpIdx = params.length
  params.push(name || null)
  const nameIdx = params.length
  params.push(name ? `%${name}%` : null)
  const nameLikeIdx = params.length

  query += ` AND ($${tierIdx}::text IS NULL OR COALESCE(t.tier::text, 'D') = $${tierIdx})
       AND ($${assignedToIdx}::text IS NULL OR a.assigned_to = $${assignedToIdx}::int)
       AND ($${rsvpIdx}::text IS NULL OR a.rsvp::text = $${rsvpIdx})
       AND ($${nameIdx}::text IS NULL OR m.full_name ILIKE $${nameLikeIdx})`

  if (expiry === 'expired') {
    query += ` AND m.expired_at < NOW()`
  } else if (expiry === 'expiring') {
    query += ` AND m.expired_at BETWEEN NOW() AND NOW() + INTERVAL '90 days'`
  } else if (expiry === 'lifetime') {
    query += ` AND m.membership_type IN ('ตลอดชีพ', 'สมาชิกตลอดชีพ')`
  }

  params.push(status || null)
  const statusIdx = params.length
  params.push(called || null)
  const calledIdx = params.length
  params.push(sms || null)
  const smsIdx = params.length

  query += `
       AND ($${statusIdx}::text IS NULL
             OR ($${statusIdx} = 'assigned' AND a.id IS NOT NULL)
             OR ($${statusIdx} = 'unassigned' AND a.id IS NULL))
       AND ($${calledIdx}::text IS NULL
             OR ($${calledIdx} = 'called' AND COALESCE(ls.total_calls, 0) > 0)
             OR ($${calledIdx} = 'uncalled' AND COALESCE(ls.total_calls, 0) = 0 AND a.id IS NOT NULL))
       AND ($${smsIdx}::text IS NULL
             OR ($${smsIdx} = 'sms_sent' AND COALESCE(ls.sms_count, 0) > 0)
             OR ($${smsIdx} = 'no_sms'   AND COALESCE(ls.sms_count, 0) = 0))
     ORDER BY ${
       sort === 'least_called' ? `COALESCE(atl.all_time_calls, 0) ASC, m.home_amphure ASC, m.home_district ASC, m.first_name ASC` :
       sort === 'uncalled'     ? `COALESCE(ls.total_calls, 0) ASC, m.home_amphure ASC, m.home_district ASC, m.first_name ASC` :
       sort === 'tier'         ? `CASE COALESCE(t.tier::text, 'D') WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC, COALESCE(ls.total_calls, 0) ASC, m.home_amphure ASC, m.home_district ASC, m.first_name ASC` :
                                 `m.home_amphure ASC, m.home_district ASC, m.first_name ASC`
     }, m.source_id ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`

  params.push(limit, offset)

  const { rows } = await pool.query(query, params)
  return rows
}

export async function getMembersInCampaignStats(orgId, campaignId) {
  const BASE = `
    FROM cache_pple_event cc
    JOIN cache_pple_member m ON (cc.province IS NULL OR m.home_province = cc.province)
    WHERE cc.id = $1 AND cc.type IN ('campaign', 'event') AND m.mobile_number IS NOT NULL
      AND m.org_id = $2`

  const [mainRes, amphureRes, districtCountRes, tierRes, assigneeRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(DISTINCT m.source_id) AS total,
         SUM(CASE WHEN lc.log_count > 0 THEN 1 ELSE 0 END) AS called,
         SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
         SUM(CASE WHEN a.id IS NULL THEN 1 ELSE 0 END) AS unassigned
       FROM cache_pple_event cc
       JOIN cache_pple_member m ON (cc.province IS NULL OR m.home_province = cc.province)
       LEFT JOIN calling_assignments a ON a.campaign_id = cc.id AND a.member_id = m.source_id::text AND a.contact_type = 'member'
       LEFT JOIN (
         SELECT member_id, COUNT(*) AS log_count
         FROM calling_logs WHERE campaign_id = $1 AND contact_type = 'member'
         GROUP BY member_id
       ) lc ON lc.member_id = m.source_id::text
       WHERE cc.id = $2 AND cc.type IN ('campaign', 'event') AND m.mobile_number IS NOT NULL AND m.org_id = $3`,
      [campaignId, campaignId, orgId]
    ),
    pool.query(
      `SELECT COALESCE(m.home_amphure, '') AS amphure, COUNT(DISTINCT m.source_id) AS count
       ${BASE} GROUP BY m.home_amphure ORDER BY m.home_amphure`,
      [campaignId, orgId]
    ),
    pool.query(
      `SELECT COALESCE(m.home_amphure, '') AS amphure, COUNT(DISTINCT m.home_district) AS "districtCount"
       ${BASE} GROUP BY m.home_amphure ORDER BY m.home_amphure`,
      [campaignId, orgId]
    ),
    pool.query(
      `SELECT COALESCE(t.tier::text, 'D') AS tier, COUNT(DISTINCT m.source_id) AS count
       FROM cache_pple_event cc
       JOIN cache_pple_member m ON (cc.province IS NULL OR m.home_province = cc.province)
       LEFT JOIN calling_member_tiers t ON t.member_id = m.source_id::text AND t.contact_type = 'member'
       WHERE cc.id = $1 AND cc.type IN ('campaign', 'event') AND m.mobile_number IS NOT NULL AND m.org_id = $2
       GROUP BY COALESCE(t.tier::text, 'D')`,
      [campaignId, orgId]
    ),
    pool.query(
      `SELECT a.assigned_to, COUNT(DISTINCT m.source_id) AS count
       FROM cache_pple_event cc
       JOIN cache_pple_member m ON (cc.province IS NULL OR m.home_province = cc.province)
       JOIN calling_assignments a ON a.campaign_id = cc.id AND a.member_id = m.source_id::text AND a.contact_type = 'member'
       WHERE cc.id = $1 AND cc.type IN ('campaign', 'event') AND m.mobile_number IS NOT NULL AND m.org_id = $2
       GROUP BY a.assigned_to`,
      [campaignId, orgId]
    ),
  ])

  const row = mainRes.rows[0] || {}

  const amphureCounts = {}
  for (const r of amphureRes.rows) {
    amphureCounts[r.amphure] = Number(r.count)
  }

  const amphureDistrictCounts = {}
  for (const r of districtCountRes.rows) {
    amphureDistrictCounts[r.amphure] = Number(r.districtCount)
  }

  const tierCounts = {}
  for (const r of tierRes.rows) tierCounts[r.tier] = Number(r.count)

  const assigneeCounts = assigneeRes.rows.map(r => ({ id: r.assigned_to, count: Number(r.count) }))

  return {
    total: Number(row.total) || 0,
    called: Number(row.called) || 0,
    assigned: Number(row.assigned) || 0,
    unassigned: Number(row.unassigned) || 0,
    districts: Object.keys(amphureCounts),
    districtCounts: amphureCounts,
    tierCounts,
    assigneeCounts,
  }
}

export async function getUnassignedMemberIds(orgId, campaignId) {
  const { rows } = await pool.query(
    `SELECT m.source_id
     FROM cache_pple_event cc
     JOIN cache_pple_member m
       ON (cc.province IS NULL OR m.home_province = cc.province)
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = m.source_id::text AND a.contact_type = 'member'
     LEFT JOIN calling_logs l
       ON l.campaign_id = cc.id AND l.member_id = m.source_id::text AND l.contact_type = 'member'
     WHERE cc.id = $1 AND cc.type IN ('campaign', 'event') AND m.org_id = $2
     GROUP BY m.source_id, m.home_amphure, m.first_name
     HAVING COUNT(DISTINCT l.id) = 0 AND MAX(a.id) IS NULL
     ORDER BY m.home_amphure ASC, m.first_name ASC`,
    [campaignId, orgId]
  )
  return rows.map(r => r.source_id)
}

export async function getMemberCallHistory(campaignId, memberId) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_logs
     WHERE campaign_id = $1 AND member_id = $2 AND contact_type = 'member'
     ORDER BY called_at DESC`,
    [campaignId, memberId]
  )
  return rows
}

export async function getMyCampaigns(userId) {
  const { rows } = await pool.query(
    `SELECT
       ec.id, ec.name, ec.province,
       COUNT(a.member_id) AS assigned_count,
       SUM(CASE WHEN camp_stats.camp_calls > 0 THEN 1 ELSE 0 END) AS called_count
     FROM calling_assignments a
     JOIN cache_pple_event ec ON ec.id = a.campaign_id AND ec.type IN ('campaign', 'event')
     LEFT JOIN (
       SELECT campaign_id, member_id, COUNT(*) AS camp_calls
       FROM calling_logs WHERE contact_type = 'member' GROUP BY campaign_id, member_id
     ) camp_stats ON camp_stats.campaign_id = a.campaign_id AND camp_stats.member_id = a.member_id
     WHERE a.assigned_to = $1 AND a.contact_type = 'member'
       AND (ec.event_date IS NULL OR ec.event_date >= CURRENT_DATE - INTERVAL '7 days')
     GROUP BY ec.id
     ORDER BY ec.name ASC`,
    [userId]
  )
  return rows
}

export async function getMyAssignedMembers(orgId, userId, { campaignId, status, rsvp, limit = 200, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT
         m.*,
         COALESCE(t.tier::text, 'D') AS tier,
         a.campaign_id,
         a.created_at AS assigned_at,
         a.rsvp,
         ec.name AS campaign_name,
         ec.description AS campaign_description,
         TO_CHAR(ec.event_date, 'YYYY-MM-DD"T"HH24:MI') AS event_date,
         COALESCE(all_stats.total_calls, 0) AS total_calls,
         COALESCE(all_stats.answered_count, 0) AS answered_count,
         COALESCE(camp_stats.camp_calls, 0) AS camp_calls,
         CASE WHEN COALESCE(camp_stats.camp_calls, 0) > 0 THEN 'called' ELSE 'pending' END AS call_status,
         latest_log.note AS latest_note,
         latest_log.status AS latest_log_status,
         latest_log.called_at AS latest_called_at,
         u.discord_id,
         u.username AS discord_username,
         dc.avatar AS discord_avatar
       FROM calling_assignments a
       JOIN cache_pple_member m ON m.source_id::text = a.member_id AND m.org_id = $1
       LEFT JOIN calling_member_tiers t ON t.member_id = a.member_id AND t.contact_type = 'member'
       LEFT JOIN cache_pple_event ec ON ec.id = a.campaign_id AND ec.type IN ('campaign', 'event')
       LEFT JOIN LATERAL (SELECT om.avatar, om.user_id FROM org_members om WHERE om.serial = m.serial AND om.org_id = $1 LIMIT 1) dc ON true
       LEFT JOIN users u ON u.id = dc.user_id
       LEFT JOIN (
         SELECT member_id,
           COUNT(*) AS total_calls,
           SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered_count
         FROM calling_logs WHERE contact_type = 'member' GROUP BY member_id
       ) all_stats ON all_stats.member_id = a.member_id
       LEFT JOIN (
         SELECT campaign_id, member_id, COUNT(*) AS camp_calls
         FROM calling_logs WHERE contact_type = 'member' GROUP BY campaign_id, member_id
       ) camp_stats ON camp_stats.campaign_id = a.campaign_id AND camp_stats.member_id = a.member_id
       LEFT JOIN (
         SELECT l.*
         FROM calling_logs l
         INNER JOIN (
           SELECT member_id, MAX(id) AS max_id FROM calling_logs WHERE contact_type = 'member' GROUP BY member_id
         ) lm ON lm.member_id = l.member_id AND lm.max_id = l.id
       ) latest_log ON latest_log.member_id = a.member_id
       WHERE a.assigned_to = $2 AND a.contact_type = 'member'
         AND ($3::int IS NULL OR a.campaign_id = $3)
         AND ($4::text IS NULL OR a.rsvp::text = $4)
     ) sub
     WHERE ($5::text IS NULL OR call_status = $5)
       AND (event_date IS NULL OR event_date >= TO_CHAR(CURRENT_DATE - INTERVAL '7 days', 'YYYY-MM-DD'))
     ORDER BY
       CASE WHEN call_status = 'pending' THEN 0 ELSE 1 END ASC,
       CASE WHEN call_status = 'pending' THEN CASE tier WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ELSE NULL END ASC,
       CASE WHEN call_status = 'pending' THEN home_amphure ELSE NULL END ASC,
       CASE WHEN call_status = 'pending' THEN first_name ELSE NULL END ASC,
       latest_called_at ASC
     LIMIT $6 OFFSET $7`,
    [orgId, userId, campaignId || null, rsvp || null, status || null, limit, offset]
  )
  return rows
}

export async function getPendingCallCount(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count
     FROM calling_assignments a
     LEFT JOIN cache_pple_event ec ON ec.id = a.campaign_id AND ec.type IN ('campaign', 'event')
     LEFT JOIN (
       SELECT campaign_id, member_id, COUNT(*) AS camp_calls
       FROM calling_logs WHERE contact_type = 'member' GROUP BY campaign_id, member_id
     ) cs ON cs.campaign_id = a.campaign_id AND cs.member_id = a.member_id
     WHERE a.assigned_to = $1 AND a.contact_type = 'member'
       AND (ec.event_date IS NULL OR ec.event_date >= CURRENT_DATE)
       AND COALESCE(cs.camp_calls, 0) = 0`,
    [userId]
  )
  return Number(rows[0]?.count) || 0
}

export async function getMyCallHistory(orgId, userId, { name, limit = 50, offset = 0 } = {}) {
  const keyword = name || null
  const like = keyword ? `%${keyword}%` : null
  const { rows } = await pool.query(
    `SELECT
       m.*,
       COALESCE(t.tier::text, 'D') AS tier,
       COUNT(DISTINCT l.id) AS total_calls,
       MAX(l.called_at) AS latest_called_at,
       llatest.note AS latest_note,
       llatest.status AS latest_status,
       llatest.campaign_id AS latest_campaign_id,
       ec.name AS latest_campaign_name
     FROM calling_logs l
     JOIN cache_pple_member m ON m.source_id::text = l.member_id AND m.org_id = $1
     LEFT JOIN calling_member_tiers t ON t.member_id = l.member_id AND t.contact_type = 'member'
     LEFT JOIN (
       SELECT l2.member_id, l2.note, l2.status, l2.campaign_id
       FROM calling_logs l2
       INNER JOIN (
         SELECT member_id, MAX(id) AS max_id
         FROM calling_logs
         WHERE called_by = $2 AND contact_type = 'member'
         GROUP BY member_id
       ) lm ON lm.member_id = l2.member_id AND lm.max_id = l2.id
     ) llatest ON llatest.member_id = l.member_id
     LEFT JOIN cache_pple_event ec ON ec.id = llatest.campaign_id AND ec.type IN ('campaign', 'event')
     WHERE l.called_by = $3 AND l.contact_type = 'member'
       AND ($4::text IS NULL OR m.full_name ILIKE $5 OR m.mobile_number ILIKE $5 OR l.note ILIKE $5)
     GROUP BY l.member_id, m.source_id, t.tier, llatest.note, llatest.status, llatest.campaign_id, ec.name
     ORDER BY latest_called_at DESC
     LIMIT $6 OFFSET $7`,
    [orgId, userId, userId, keyword, like, limit, offset]
  )
  return rows
}

export async function getMyCallHistoryFlat(orgId, userId, { name, limit = 60, offset = 0 } = {}) {
  const keyword = name || null
  const like = keyword ? `%${keyword}%` : null
  const { rows } = await pool.query(
    `(SELECT
       l.id AS log_id, l.status::text AS status, l.note, l.called_at, l.campaign_id,
       'member' AS contact_type, l.member_id,
       m.full_name, m.mobile_number,
       m.home_district, m.home_amphure, m.home_province,
       dc.avatar AS discord_avatar, u.discord_id,
       COALESCE(t.tier::text, 'D') AS tier,
       ec.name AS campaign_name
     FROM calling_logs l
     JOIN cache_pple_member m ON m.source_id::text = l.member_id AND m.org_id = $1
     LEFT JOIN LATERAL (SELECT om.avatar, om.user_id FROM org_members om WHERE om.serial = m.serial AND om.org_id = $1 LIMIT 1) dc ON true
     LEFT JOIN users u ON u.id = dc.user_id
     LEFT JOIN calling_member_tiers t ON t.member_id = l.member_id AND t.contact_type = 'member'
     LEFT JOIN cache_pple_event ec ON ec.id = l.campaign_id AND ec.type IN ('campaign', 'event')
     WHERE l.called_by = $2 AND l.contact_type = 'member'
       AND ($3::text IS NULL OR m.full_name ILIKE $4 OR m.mobile_number ILIKE $4 OR l.note ILIKE $4))
    UNION ALL
    (SELECT
       l.id AS log_id, l.status::text AS status, l.note, l.called_at, l.campaign_id,
       'contact' AS contact_type, l.member_id,
       c.first_name || CASE WHEN c.last_name IS NOT NULL AND c.last_name != '' THEN ' ' || c.last_name ELSE '' END AS full_name,
       c.phone AS mobile_number,
       c.tambon AS home_district, c.amphoe AS home_amphure, c.province AS home_province,
       NULL AS discord_avatar, NULL AS discord_id,
       'D' AS tier,
       NULL AS campaign_name
     FROM calling_logs l
     JOIN calling_contacts c ON c.id::text = l.member_id
     WHERE l.called_by = $5 AND l.contact_type = 'contact'
       AND ($6::text IS NULL OR (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE $7 OR c.phone ILIKE $7 OR l.note ILIKE $7))
    ORDER BY called_at DESC
    LIMIT $8 OFFSET $9`,
    [orgId, userId, keyword, like,
     userId, keyword, like,
     limit, offset]
  )
  return rows
}

export async function getMemberGlobalCallHistory(memberId) {
  const { rows } = await pool.query(
    `SELECT
       cl.*,
       cc.name AS campaign_name
     FROM calling_logs cl
     JOIN cache_pple_event cc ON cc.id = cl.campaign_id AND cc.type IN ('campaign', 'event')
     WHERE cl.member_id = $1
     ORDER BY cl.called_at DESC`,
    [memberId]
  )
  return rows
}
