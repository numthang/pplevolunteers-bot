import pool from '../index.js'

export async function getContactById(id) {
  const [rows] = await pool.query(`SELECT * FROM calling_contacts WHERE id = ?`, [id])
  return rows[0] || null
}

export async function createContact(data) {
  const { guild_id, first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty, created_by } = data
  const [result] = await pool.query(
    `INSERT INTO calling_contacts
      (guild_id, first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [guild_id, first_name, last_name || null, phone || null, email || null, line_id || null,
     category || null, province || null, amphoe || null, tambon || null, note || null, specialty || null, created_by || null]
  )
  return result.insertId
}

export async function updateContact(id, data) {
  const { first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty, updated_by } = data
  await pool.query(
    `UPDATE calling_contacts
     SET first_name=?, last_name=?, phone=?, email=?, line_id=?, category=?,
         province=?, amphoe=?, tambon=?, note=?, specialty=?, updated_by=?
     WHERE id = ?`,
    [first_name, last_name || null, phone || null, email || null, line_id || null, category || null,
     province || null, amphoe || null, tambon || null, note || null, specialty || null, updated_by || null, id]
  )
}

export async function deleteContact(id) {
  await pool.query(`DELETE FROM calling_contacts WHERE id = ?`, [id])
}

export async function searchContacts(keyword, guildId, { limit = 50, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_contacts
     WHERE guild_id = ?
       AND (CONCAT(first_name, ' ', last_name) LIKE ? OR phone LIKE ? OR email LIKE ?)
     ORDER BY first_name ASC, last_name ASC
     LIMIT ? OFFSET ?`,
    [guildId, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, limit, offset]
  )
  return rows
}

export async function getContactsByProvince(province, guildId, { limit = 200, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_contacts
     WHERE guild_id = ? AND province = ?
     ORDER BY amphoe ASC, first_name ASC
     LIMIT ? OFFSET ?`,
    [guildId, province, limit, offset]
  )
  return rows
}

export async function getContactsList(guildId, { province, provinces, keyword, limit = 100, offset = 0 } = {}) {
  let query = `SELECT * FROM calling_contacts WHERE guild_id = ?`
  const params = [guildId]

  if (province) {
    query += ` AND province = ?`; params.push(province)
  } else if (provinces && provinces.length > 0) {
    query += ` AND province IN (${provinces.map(() => '?').join(',')})`
    params.push(...provinces)
  }
  if (keyword) {
    query += ` AND (CONCAT(first_name,' ',COALESCE(last_name,'')) LIKE ? OR phone LIKE ? OR line_id LIKE ?)`
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  query += ` ORDER BY province ASC, amphoe ASC, first_name ASC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const [rows] = await pool.query(query, params)
  return rows
}

export async function getContactsInCampaign(campaignId, filters = {}, limit = 100, offset = 0) {
  const { amphoe, tier, status, assignedTo, name, called, sort } = filters

  let query = `SELECT
     c.*,
     COALESCE(t.tier, 'D') AS tier,
     COALESCE(a.assigned_to, '') AS assigned_to,
     COALESCE(a.assigned_by, '') AS assigned_by,
     a.created_at AS assignment_date,
     l.called_at AS last_called_at,
     l.status AS last_status,
     l.note AS last_note,
     COUNT(DISTINCT l.id) AS total_calls,
     SUM(CASE WHEN l.status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
     CASE WHEN a.id IS NOT NULL THEN 'assigned' ELSE 'unassigned' END AS member_status
   FROM act_event_cache cc
   JOIN calling_contacts c ON c.guild_id = ?
   LEFT JOIN calling_member_tiers t
     ON t.member_id = c.id AND t.contact_type = 'contact'
   LEFT JOIN calling_assignments a
     ON a.campaign_id = cc.id AND a.member_id = c.id AND a.contact_type = 'contact'
   LEFT JOIN calling_logs l
     ON l.campaign_id = cc.id AND l.member_id = c.id AND l.contact_type = 'contact'
   WHERE cc.id = ? AND cc.type = 'campaign'`

  const params = [process.env.GUILD_ID, campaignId]

  if (amphoe) { query += ` AND c.amphoe = ?`; params.push(amphoe) }
  if (name)   { query += ` AND CONCAT(c.first_name,' ',c.last_name) LIKE ?`; params.push(`%${name}%`) }

  query += `
   GROUP BY c.id
   HAVING (? IS NULL OR tier = ?)
     AND (? IS NULL OR (? = 'assigned' AND member_status = 'assigned') OR (? = 'unassigned' AND member_status = 'unassigned'))
     AND (? IS NULL OR assigned_to = ?)
     AND (? IS NULL OR (? = 'called' AND total_calls > 0) OR (? = 'uncalled' AND total_calls = 0 AND member_status = 'assigned'))
   ORDER BY ${
     sort === 'tier' ? `CASE COALESCE(t.tier,'D') WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC, COUNT(DISTINCT l.id) ASC, c.amphoe ASC, c.first_name ASC` :
                       `c.amphoe ASC, c.first_name ASC`
   }, c.id ASC
   LIMIT ? OFFSET ?`

  params.push(
    tier || null, tier || null,
    status || null, status || null, status || null,
    assignedTo || null, assignedTo || null,
    called || null, called || null, called || null,
    limit, offset
  )

  const [rows] = await pool.query(query, params)
  return rows
}

export async function getContactsInCampaignStats(campaignId, provinces = null) {
  const scopeClause = provinces && provinces.length > 0
    ? `AND (c.province IS NULL OR c.province IN (${provinces.map(() => '?').join(',')}))`
    : ''
  const scopeParams = provinces && provinces.length > 0 ? provinces : []

  const [[mainRows], [amphoeRows], [assigneeRows]] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(DISTINCT c.id) AS total,
         SUM(CASE WHEN lc.log_count > 0 THEN 1 ELSE 0 END) AS called,
         SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
         SUM(CASE WHEN a.id IS NULL THEN 1 ELSE 0 END) AS unassigned
       FROM act_event_cache cc
       JOIN calling_contacts c ON c.guild_id = ?
       LEFT JOIN calling_assignments a
         ON a.campaign_id = cc.id AND a.member_id = c.id AND a.contact_type = 'contact'
       LEFT JOIN (
         SELECT member_id, COUNT(*) AS log_count
         FROM calling_logs WHERE campaign_id = ? AND contact_type = 'contact'
         GROUP BY member_id
       ) lc ON lc.member_id = c.id
       WHERE cc.id = ? AND cc.type = 'campaign' ${scopeClause}`,
      [process.env.GUILD_ID, campaignId, campaignId, ...scopeParams]
    ),
    pool.query(
      `SELECT COALESCE(c.amphoe,'') AS amphoe, COUNT(DISTINCT c.id) AS count
       FROM act_event_cache cc
       JOIN calling_contacts c ON c.guild_id = ?
       WHERE cc.id = ? AND cc.type = 'campaign' ${scopeClause}
       GROUP BY c.amphoe ORDER BY c.amphoe`,
      [process.env.GUILD_ID, campaignId, ...scopeParams]
    ),
    pool.query(
      `SELECT a.assigned_to, COUNT(DISTINCT c.id) AS count
       FROM act_event_cache cc
       JOIN calling_contacts c ON c.guild_id = ?
       JOIN calling_assignments a
         ON a.campaign_id = cc.id AND a.member_id = c.id AND a.contact_type = 'contact'
       WHERE cc.id = ? AND cc.type = 'campaign' ${scopeClause}
       GROUP BY a.assigned_to`,
      [process.env.GUILD_ID, campaignId, ...scopeParams]
    ),
  ])

  const row = mainRows[0] || {}
  const districtCounts = {}
  for (const r of amphoeRows) districtCounts[r.amphoe] = Number(r.count)
  const assigneeCounts = assigneeRows.map(r => ({ id: r.assigned_to, count: Number(r.count) }))

  return {
    total: Number(row.total) || 0,
    called: Number(row.called) || 0,
    assigned: Number(row.assigned) || 0,
    unassigned: Number(row.unassigned) || 0,
    districts: Object.keys(districtCounts),
    districtCounts,
    assigneeCounts,
  }
}

export async function getUnassignedContactIds(campaignId) {
  const [rows] = await pool.query(
    `SELECT c.id
     FROM act_event_cache cc
     JOIN calling_contacts c ON c.guild_id = ?
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = c.id AND a.contact_type = 'contact'
     WHERE cc.id = ? AND cc.type = 'campaign'
     GROUP BY c.id
     HAVING MAX(a.id) IS NULL
     ORDER BY c.amphoe ASC, c.first_name ASC`,
    [process.env.GUILD_ID, campaignId]
  )
  return rows.map(r => r.id)
}

export async function getContactCallHistory(contactId, campaignId = null) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_logs
     WHERE member_id = ? AND contact_type = 'contact'
       AND (? IS NULL OR campaign_id = ?)
     ORDER BY called_at DESC`,
    [contactId, campaignId, campaignId]
  )
  return rows
}

export async function getMyAssignedContacts(discordId, { campaignId, status, limit = 200, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM (
       SELECT
         c.*,
         COALESCE(t.tier, 'D') AS tier,
         a.campaign_id,
         a.created_at AS assigned_at,
         ec.name AS campaign_name,
         DATE_FORMAT(ec.event_date, '%Y-%m-%d') AS event_date,
         COALESCE(camp_stats.camp_calls, 0) AS camp_calls,
         CASE WHEN COALESCE(camp_stats.camp_calls, 0) > 0 THEN 'called' ELSE 'pending' END AS call_status,
         latest_log.note AS latest_note,
         latest_log.status AS latest_log_status,
         latest_log.called_at AS latest_called_at
       FROM calling_assignments a
       JOIN calling_contacts c ON c.id = a.member_id
       LEFT JOIN calling_member_tiers t ON t.member_id = c.id AND t.contact_type = 'contact'
       LEFT JOIN act_event_cache ec ON ec.id = a.campaign_id AND ec.type = 'campaign'
       LEFT JOIN (
         SELECT campaign_id, member_id, COUNT(*) AS camp_calls
         FROM calling_logs WHERE contact_type = 'contact'
         GROUP BY campaign_id, member_id
       ) camp_stats ON camp_stats.campaign_id = a.campaign_id AND camp_stats.member_id = c.id
       LEFT JOIN (
         SELECT l.*
         FROM calling_logs l
         INNER JOIN (
           SELECT member_id, MAX(id) AS max_id
           FROM calling_logs WHERE contact_type = 'contact' GROUP BY member_id
         ) lm ON lm.member_id = l.member_id AND lm.max_id = l.id
       ) latest_log ON latest_log.member_id = c.id
       WHERE a.assigned_to = ? AND a.contact_type = 'contact'
         AND (? IS NULL OR a.campaign_id = ?)
     ) sub
     WHERE (? IS NULL OR call_status = ?)
       AND (event_date IS NULL OR event_date >= CURDATE())
     ORDER BY
       CASE WHEN call_status = 'pending' THEN 0 ELSE 1 END ASC,
       latest_called_at ASC
     LIMIT ? OFFSET ?`,
    [discordId, campaignId || null, campaignId || null, status || null, status || null, limit, offset]
  )
  return rows
}

export async function getContactLogs(contactId) {
  const [rows] = await pool.query(
    `SELECT
       l.*,
       ec.name AS campaign_name
     FROM calling_logs l
     LEFT JOIN act_event_cache ec ON ec.id = l.campaign_id AND ec.type = 'campaign'
     WHERE l.member_id = ? AND l.contact_type = 'contact'
     ORDER BY l.called_at DESC`,
    [contactId]
  )
  return rows
}

export async function getContactPendingCount(discordId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM calling_assignments a
     LEFT JOIN act_event_cache ec ON ec.id = a.campaign_id AND ec.type = 'campaign'
     LEFT JOIN (
       SELECT campaign_id, member_id, COUNT(*) AS camp_calls
       FROM calling_logs WHERE contact_type = 'contact' GROUP BY campaign_id, member_id
     ) cs ON cs.campaign_id = a.campaign_id AND cs.member_id = a.member_id
     WHERE a.assigned_to = ? AND a.contact_type = 'contact'
       AND (ec.event_date IS NULL OR ec.event_date >= CURDATE())
       AND COALESCE(cs.camp_calls, 0) = 0`,
    [discordId]
  )
  return Number(rows[0]?.count) || 0
}
