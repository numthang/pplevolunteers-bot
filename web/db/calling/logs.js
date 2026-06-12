import pool from '../index.js'

export async function getLogById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_logs WHERE id = $1`, [id]
  )
  return rows[0] || null
}

export async function getLogsByMember(memberId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_logs
     WHERE member_id = $1
     ORDER BY called_at DESC
     LIMIT $2 OFFSET $3`,
    [memberId, limit, offset]
  )
  return rows
}

export async function getLogsByCampaignMember(campaignId, memberId, contactType = 'member') {
  const { rows } = await pool.query(
    `SELECT * FROM calling_logs
     WHERE member_id = $1 AND contact_type = $2
       AND ($3::int IS NULL OR campaign_id = $3)
     ORDER BY called_at DESC`,
    [memberId, contactType, campaignId]
  )
  return rows
}

export async function getLogsByCampaign(campaignId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM calling_logs
     WHERE campaign_id = $1
     ORDER BY called_at DESC
     LIMIT $2 OFFSET $3`,
    [campaignId, limit, offset]
  )
  return rows
}

export async function createLog(guildId, data) {
  const {
    campaign_id = 0,
    member_id,
    contact_type = 'member',
    called_by,
    caller_name,
    caller_image,
    status,
    sig_overall,
    sig_location,
    sig_availability,
    sig_interest,
    sig_reachable,
    note,
    extra,
    called_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
  } = data

  const { rows } = await pool.query(
    `INSERT INTO calling_logs
      (campaign_id, contact_type, member_id, called_by, caller_name, caller_image, called_at, status,
       sig_overall, sig_location, sig_availability, sig_interest, sig_reachable,
       note, extra, guild_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
     RETURNING id`,
    [
      campaign_id || 0,
      contact_type,
      member_id,
      called_by || null,
      caller_name || null,
      caller_image || null,
      called_at,
      status,
      sig_overall || null,
      sig_location || null,
      sig_availability || null,
      sig_interest || null,
      sig_reachable || null,
      note || null,
      extra ? JSON.stringify(extra) : null,
      guildId
    ]
  )
  return rows[0].id
}

export async function updateLog(id, data) {
  const { status, sig_overall, sig_location, sig_availability, sig_interest, sig_reachable, note, extra } = data
  await pool.query(
    `UPDATE calling_logs
     SET status = $1, sig_overall = $2, sig_location = $3, sig_availability = $4,
         sig_interest = $5, sig_reachable = $6, note = $7, extra = $8
     WHERE id = $9`,
    [
      status,
      sig_overall || null, sig_location || null, sig_availability || null,
      sig_interest || null, sig_reachable || null,
      note || null,
      extra ? JSON.stringify(extra) : null,
      id
    ]
  )
}

export async function deleteLog(id) {
  await pool.query(`DELETE FROM calling_logs WHERE id = $1`, [id])
}

export async function getMemberCallStats(memberId, campaignId = null, contactType = 'member') {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) AS total_calls,
       SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
       SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) AS no_answer_count,
       SUM(CASE WHEN status = 'not_called' THEN 1 ELSE 0 END) AS not_called_count,
       SUM(CASE WHEN status = 'met' THEN 1 ELSE 0 END) AS met_count,
       AVG(sig_overall) AS avg_sig_overall,
       MAX(called_at) AS last_called_at
     FROM calling_logs
     WHERE member_id = $1 AND contact_type = $2
       AND ($3::int IS NULL OR campaign_id = $3)`,
    [memberId, contactType, campaignId]
  )
  return rows[0] || {
    total_calls: 0, answered_count: 0, no_answer_count: 0,
    not_called_count: 0, met_count: 0, avg_sig_overall: null, last_called_at: null
  }
}

export async function calculateTierFromSignals(memberId, campaignId = null, contactType = 'member') {
  const stats = await getMemberCallStats(memberId, campaignId, contactType)
  const contactedCount = Number(stats.answered_count || 0) + Number(stats.met_count || 0)
  if (!contactedCount) return null
  const avg = parseFloat(stats.avg_sig_overall) || 0
  if (avg >= 3.5) return 'A'
  if (avg >= 2.5) return 'B'
  if (avg >= 1.5) return 'C'
  return 'D'
}
