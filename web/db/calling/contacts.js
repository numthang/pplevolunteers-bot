import pool from '../index.js'

export async function getContactById(id) {
  const { rows } = await pool.query(`SELECT * FROM calling_contacts WHERE id = $1`, [id])
  return rows[0] || null
}

export async function createContact(data) {
  const { guild_id, first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty, created_by } = data
  const { rows } = await pool.query(
    `INSERT INTO calling_contacts
      (guild_id, first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [guild_id, first_name, last_name || null, phone || null, email || null, line_id || null,
     category || null, province || null, amphoe || null, tambon || null, note || null, specialty || null, created_by || null]
  )
  return rows[0].id
}

export async function updateContact(id, data) {
  const { first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty, updated_by } = data
  await pool.query(
    `UPDATE calling_contacts
     SET first_name=$1, last_name=$2, phone=$3, email=$4, line_id=$5, category=$6,
         province=$7, amphoe=$8, tambon=$9, note=$10, specialty=$11, updated_by=$12
     WHERE id = $13`,
    [first_name, last_name || null, phone || null, email || null, line_id || null, category || null,
     province || null, amphoe || null, tambon || null, note || null, specialty || null, updated_by || null, id]
  )
}

export async function deleteContact(id) {
  await pool.query(`DELETE FROM calling_contacts WHERE id = $1`, [id])
}

export async function searchContacts(keyword, guildId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_contacts
     WHERE guild_id = $1
       AND ((first_name || ' ' || COALESCE(last_name, '')) ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)
     ORDER BY first_name ASC, last_name ASC
     LIMIT $3 OFFSET $4`,
    [guildId, `%${keyword}%`, limit, offset]
  )
  return rows
}

export async function getContactsByProvince(province, guildId, { limit = 200, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_contacts
     WHERE guild_id = $1 AND province = $2
     ORDER BY amphoe ASC, first_name ASC
     LIMIT $3 OFFSET $4`,
    [guildId, province, limit, offset]
  )
  return rows
}

export async function getContactsList(guildId, { province, provinces, keyword, limit = 100, offset = 0 } = {}) {
  const params = [guildId]
  let query = `SELECT * FROM calling_contacts WHERE guild_id = $1`

  if (province) {
    params.push(province)
    query += ` AND province = $${params.length}`
  } else if (provinces && provinces.length > 0) {
    params.push(provinces)
    query += ` AND province = ANY($${params.length})`
  }
  if (keyword) {
    params.push(`%${keyword}%`)
    query += ` AND ((first_name || ' ' || COALESCE(last_name, '')) ILIKE $${params.length} OR phone ILIKE $${params.length} OR line_id ILIKE $${params.length})`
  }

  params.push(limit, offset)
  query += ` ORDER BY province ASC, amphoe ASC, first_name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`

  const { rows } = await pool.query(query, params)
  return rows
}

export async function getContactsInCampaign(campaignId, filters = {}, limit = 100, offset = 0) {
  const { amphoe, tier, status, assignedTo, name, called, sort, sms } = filters

  const params = [process.env.GUILD_ID, campaignId]

  let query = `SELECT
     c.*,
     COALESCE(t.tier::text, 'D') AS tier,
     COALESCE(a.assigned_to, '') AS assigned_to,
     COALESCE(a.assigned_by, '') AS assigned_by,
     a.created_at AS assignment_date,
     l.called_at AS last_called_at,
     l.status AS last_status,
     l.note AS last_note,
     COUNT(DISTINCT l.id) AS total_calls,
     SUM(CASE WHEN l.status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
     SUM(CASE WHEN l.status IN ('sms_sent', 'sms_delivered') THEN 1 ELSE 0 END) AS sms_count,
     CASE WHEN a.id IS NOT NULL THEN 'assigned' ELSE 'unassigned' END AS member_status
   FROM act_event_cache cc
   JOIN calling_contacts c ON c.guild_id = $1
   LEFT JOIN calling_member_tiers t
     ON t.member_id = c.id::text AND t.contact_type = 'contact'
   LEFT JOIN calling_assignments a
     ON a.campaign_id = cc.id AND a.member_id = c.id::text AND a.contact_type = 'contact'
   LEFT JOIN calling_logs l
     ON l.campaign_id = cc.id AND l.member_id = c.id::text AND l.contact_type = 'contact'
   WHERE cc.id = $2 AND cc.type = 'campaign'`

  if (amphoe) { params.push(amphoe); query += ` AND c.amphoe = $${params.length}` }
  if (name)   { params.push(`%${name}%`); query += ` AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE $${params.length}` }

  params.push(tier || null)
  const tierIdx = params.length
  params.push(status || null)
  const statusIdx = params.length
  params.push(assignedTo || null)
  const assignedToIdx = params.length
  params.push(called || null)
  const calledIdx = params.length
  params.push(sms || null)
  const smsIdx = params.length

  query += `
   GROUP BY c.id, t.tier, a.id, a.assigned_to, a.assigned_by, a.created_at,
            l.called_at, l.status, l.note
   HAVING ($${tierIdx}::text IS NULL OR COALESCE(t.tier::text, 'D') = $${tierIdx})
     AND ($${statusIdx}::text IS NULL
          OR ($${statusIdx} = 'assigned' AND a.id IS NOT NULL)
          OR ($${statusIdx} = 'unassigned' AND a.id IS NULL))
     AND ($${assignedToIdx}::text IS NULL OR a.assigned_to = $${assignedToIdx})
     AND ($${calledIdx}::text IS NULL
          OR ($${calledIdx} = 'called' AND COUNT(DISTINCT l.id) > 0)
          OR ($${calledIdx} = 'uncalled' AND COUNT(DISTINCT l.id) = 0 AND a.id IS NOT NULL))
     AND ($${smsIdx}::text IS NULL
          OR ($${smsIdx} = 'sms_sent' AND SUM(CASE WHEN l.status IN ('sms_sent','sms_delivered') THEN 1 ELSE 0 END) > 0)
          OR ($${smsIdx} = 'no_sms'   AND SUM(CASE WHEN l.status IN ('sms_sent','sms_delivered') THEN 1 ELSE 0 END) = 0))
   ORDER BY ${
     sort === 'tier' ? `CASE COALESCE(t.tier::text,'D') WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END ASC, COUNT(DISTINCT l.id) ASC, c.amphoe ASC, c.first_name ASC` :
                       `c.amphoe ASC, c.first_name ASC`
   }, c.id ASC
   LIMIT $${params.length + 1} OFFSET $${params.length + 2}`

  params.push(limit, offset)

  const { rows } = await pool.query(query, params)
  return rows
}

export async function getContactsInCampaignStats(campaignId, provinces = null) {
  const hasProvinces = provinces && provinces.length > 0
  const scopeClause = hasProvinces ? `AND (c.province IS NULL OR c.province = ANY($4))` : ''

  const params1 = [process.env.GUILD_ID, campaignId, campaignId]
  if (hasProvinces) params1.push(provinces)

  const params2 = [process.env.GUILD_ID, campaignId]
  if (hasProvinces) params2.push(null, provinces)  // placeholder $3 unused to keep $4 consistent
  // Actually for queries 2 and 3, the scopeClause has $4; we need params position $4 if exists
  // Let me redo this more carefully

  const buildQuery2or3 = (selectClause, groupOrderClause) => {
    const p = [process.env.GUILD_ID, campaignId]
    let scope = ''
    if (hasProvinces) {
      p.push(provinces)
      scope = `AND (c.province IS NULL OR c.province = ANY($${p.length}))`
    }
    return {
      sql: `${selectClause}
            FROM act_event_cache cc
            JOIN calling_contacts c ON c.guild_id = $1
            WHERE cc.id = $2 AND cc.type = 'campaign' ${scope}
            ${groupOrderClause}`,
      params: p,
    }
  }

  const q2 = buildQuery2or3(
    `SELECT COALESCE(c.amphoe,'') AS amphoe, COUNT(DISTINCT c.id) AS count`,
    `GROUP BY c.amphoe ORDER BY c.amphoe`
  )

  const q3 = {
    sql: `SELECT a.assigned_to, COUNT(DISTINCT c.id) AS count
          FROM act_event_cache cc
          JOIN calling_contacts c ON c.guild_id = $1
          JOIN calling_assignments a
            ON a.campaign_id = cc.id AND a.member_id = c.id::text AND a.contact_type = 'contact'
          WHERE cc.id = $2 AND cc.type = 'campaign'${hasProvinces ? ` AND (c.province IS NULL OR c.province = ANY($3))` : ''}
          GROUP BY a.assigned_to`,
    params: hasProvinces ? [process.env.GUILD_ID, campaignId, provinces] : [process.env.GUILD_ID, campaignId],
  }

  const mainSql = `SELECT
       COUNT(DISTINCT c.id) AS total,
       SUM(CASE WHEN lc.log_count > 0 THEN 1 ELSE 0 END) AS called,
       SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS assigned,
       SUM(CASE WHEN a.id IS NULL THEN 1 ELSE 0 END) AS unassigned
     FROM act_event_cache cc
     JOIN calling_contacts c ON c.guild_id = $1
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = c.id::text AND a.contact_type = 'contact'
     LEFT JOIN (
       SELECT member_id, COUNT(*) AS log_count
       FROM calling_logs WHERE campaign_id = $2 AND contact_type = 'contact'
       GROUP BY member_id
     ) lc ON lc.member_id = c.id::text
     WHERE cc.id = $3 AND cc.type = 'campaign'${hasProvinces ? ` AND (c.province IS NULL OR c.province = ANY($4))` : ''}`

  const mainParams = hasProvinces
    ? [process.env.GUILD_ID, campaignId, campaignId, provinces]
    : [process.env.GUILD_ID, campaignId, campaignId]

  const [mainRes, amphoeRes, assigneeRes] = await Promise.all([
    pool.query(mainSql, mainParams),
    pool.query(q2.sql, q2.params),
    pool.query(q3.sql, q3.params),
  ])

  const row = mainRes.rows[0] || {}
  const districtCounts = {}
  for (const r of amphoeRes.rows) districtCounts[r.amphoe] = Number(r.count)
  const assigneeCounts = assigneeRes.rows.map(r => ({ id: r.assigned_to, count: Number(r.count) }))

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
  const { rows } = await pool.query(
    `SELECT c.id
     FROM act_event_cache cc
     JOIN calling_contacts c ON c.guild_id = $1
     LEFT JOIN calling_assignments a
       ON a.campaign_id = cc.id AND a.member_id = c.id::text AND a.contact_type = 'contact'
     WHERE cc.id = $2 AND cc.type = 'campaign'
     GROUP BY c.id
     HAVING MAX(a.id) IS NULL
     ORDER BY c.amphoe ASC, c.first_name ASC`,
    [process.env.GUILD_ID, campaignId]
  )
  return rows.map(r => r.id)
}

export async function getContactCallHistory(contactId, campaignId = null) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_logs
     WHERE member_id = $1 AND contact_type = 'contact'
       AND ($2::int IS NULL OR campaign_id = $2)
     ORDER BY called_at DESC`,
    [contactId, campaignId]
  )
  return rows
}

export async function getMyAssignedContacts(discordId, { campaignId, status, limit = 200, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT
         c.*,
         COALESCE(t.tier::text, 'D') AS tier,
         a.campaign_id,
         a.created_at AS assigned_at,
         ec.name AS campaign_name,
         TO_CHAR(ec.event_date, 'YYYY-MM-DD') AS event_date,
         COALESCE(camp_stats.camp_calls, 0) AS camp_calls,
         CASE WHEN COALESCE(camp_stats.camp_calls, 0) > 0 THEN 'called' ELSE 'pending' END AS call_status,
         latest_log.note AS latest_note,
         latest_log.status AS latest_log_status,
         latest_log.called_at AS latest_called_at
       FROM calling_assignments a
       JOIN calling_contacts c ON c.id::text = a.member_id
       LEFT JOIN calling_member_tiers t ON t.member_id = c.id::text AND t.contact_type = 'contact'
       LEFT JOIN act_event_cache ec ON ec.id = a.campaign_id AND ec.type = 'campaign'
       LEFT JOIN (
         SELECT campaign_id, member_id, COUNT(*) AS camp_calls
         FROM calling_logs WHERE contact_type = 'contact'
         GROUP BY campaign_id, member_id
       ) camp_stats ON camp_stats.campaign_id = a.campaign_id AND camp_stats.member_id = c.id::text
       LEFT JOIN (
         SELECT l.*
         FROM calling_logs l
         INNER JOIN (
           SELECT member_id, MAX(id) AS max_id
           FROM calling_logs WHERE contact_type = 'contact' GROUP BY member_id
         ) lm ON lm.member_id = l.member_id AND lm.max_id = l.id
       ) latest_log ON latest_log.member_id = c.id::text
       WHERE a.assigned_to = $1 AND a.contact_type = 'contact'
         AND ($2::int IS NULL OR a.campaign_id = $2)
     ) sub
     WHERE ($3::text IS NULL OR call_status = $3)
       AND (event_date IS NULL OR event_date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'))
     ORDER BY
       CASE WHEN call_status = 'pending' THEN 0 ELSE 1 END ASC,
       latest_called_at ASC
     LIMIT $4 OFFSET $5`,
    [discordId, campaignId || null, status || null, limit, offset]
  )
  return rows
}

export async function getContactLogs(contactId) {
  const { rows } = await pool.query(
    `SELECT
       l.*,
       ec.name AS campaign_name
     FROM calling_logs l
     LEFT JOIN act_event_cache ec ON ec.id = l.campaign_id AND ec.type = 'campaign'
     WHERE l.member_id = $1 AND l.contact_type = 'contact'
     ORDER BY l.called_at DESC`,
    [contactId]
  )
  return rows
}

export async function getContactPendingCount(discordId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count
     FROM calling_assignments a
     LEFT JOIN act_event_cache ec ON ec.id = a.campaign_id AND ec.type = 'campaign'
     LEFT JOIN (
       SELECT campaign_id, member_id, COUNT(*) AS camp_calls
       FROM calling_logs WHERE contact_type = 'contact' GROUP BY campaign_id, member_id
     ) cs ON cs.campaign_id = a.campaign_id AND cs.member_id = a.member_id
     WHERE a.assigned_to = $1 AND a.contact_type = 'contact'
       AND (ec.event_date IS NULL OR ec.event_date >= CURRENT_DATE)
       AND COALESCE(cs.camp_calls, 0) = 0`,
    [discordId]
  )
  return Number(rows[0]?.count) || 0
}
