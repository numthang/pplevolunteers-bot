import pool from '../index.js'

/**
 * Get calling log by ID
 */
export async function getLogById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_logs WHERE id = ?`,
    [id]
  )
  return rows[0] || null
}

/**
 * Get logs for member in campaign
 */
export async function getLogsByCampaignMember(campaignId, memberId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_logs
     WHERE campaign_id = ? AND member_id = ?
     ORDER BY called_at DESC`,
    [campaignId, memberId]
  )
  return rows
}

/**
 * Get logs in campaign with optional filters
 */
export async function getLogsByCampaign(campaignId, { status, calledBy, limit = 100, offset = 0 } = {}) {
  let query = `SELECT * FROM calling_logs WHERE campaign_id = ?`
  const params = [campaignId]

  if (status) {
    query += ` AND status = ?`
    params.push(status)
  }

  if (calledBy) {
    query += ` AND called_by = ?`
    params.push(calledBy)
  }

  query += ` ORDER BY called_at DESC LIMIT ? OFFSET ?`
  params.push(limit, offset)

  const [rows] = await pool.query(query, params)
  return rows
}

/**
 * Create calling log
 */
export async function createLog(data) {
  const {
    campaign_id,
    member_id,
    called_by,
    caller_name,
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

  const [result] = await pool.query(
    `INSERT INTO calling_logs
      (campaign_id, member_id, called_by, caller_name, called_at, status,
       sig_overall, sig_location, sig_availability, sig_interest, sig_reachable,
       note, extra, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      campaign_id,
      member_id,
      called_by || null,
      caller_name || null,
      called_at,
      status,
      sig_overall || null,
      sig_location || null,
      sig_availability || null,
      sig_interest || null,
      sig_reachable || null,
      note || null,
      extra ? JSON.stringify(extra) : null
    ]
  )
  return result.insertId
}

/**
 * Update calling log
 */
export async function updateLog(id, data) {
  const {
    status,
    sig_overall,
    sig_location,
    sig_availability,
    sig_interest,
    sig_reachable,
    note,
    extra
  } = data

  await pool.query(
    `UPDATE calling_logs
     SET status = ?,
         sig_overall = ?,
         sig_location = ?,
         sig_availability = ?,
         sig_interest = ?,
         sig_reachable = ?,
         note = ?,
         extra = ?
     WHERE id = ?`,
    [
      status,
      sig_overall || null,
      sig_location || null,
      sig_availability || null,
      sig_interest || null,
      sig_reachable || null,
      note || null,
      extra ? JSON.stringify(extra) : null,
      id
    ]
  )
}

/**
 * Delete calling log
 */
export async function deleteLog(id) {
  await pool.query(`DELETE FROM calling_logs WHERE id = ?`, [id])
}

/**
 * Get member's latest log in campaign
 */
export async function getLatestLog(campaignId, memberId) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_logs
     WHERE campaign_id = ? AND member_id = ?
     ORDER BY called_at DESC LIMIT 1`,
    [campaignId, memberId]
  )
  return rows[0] || null
}

/**
 * Get call statistics for member in campaign
 */
export async function getMemberCallStats(campaignId, memberId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_calls,
       SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
       SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) AS no_answer_count,
       SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) AS busy_count,
       SUM(CASE WHEN status = 'wrong_number' THEN 1 ELSE 0 END) AS wrong_number_count,
       AVG(sig_overall) AS avg_sig_overall,
       MAX(called_at) AS last_called_at
     FROM calling_logs
     WHERE campaign_id = ? AND member_id = ?`,
    [campaignId, memberId]
  )
  return rows[0] || {
    total_calls: 0,
    answered_count: 0,
    no_answer_count: 0,
    busy_count: 0,
    wrong_number_count: 0,
    avg_sig_overall: null,
    last_called_at: null
  }
}

/**
 * Get campaign-wide call statistics
 */
export async function getCampaignCallStats(campaignId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_logs,
       COUNT(DISTINCT member_id) AS members_called,
       SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) AS answered_count,
       SUM(CASE WHEN status = 'no_answer' THEN 1 ELSE 0 END) AS no_answer_count,
       SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) AS busy_count,
       SUM(CASE WHEN status = 'wrong_number' THEN 1 ELSE 0 END) AS wrong_number_count,
       AVG(sig_overall) AS avg_sig_overall,
       COUNT(DISTINCT called_by) AS unique_callers
     FROM calling_logs
     WHERE campaign_id = ?`,
    [campaignId]
  )
  return rows[0] || {
    total_logs: 0,
    members_called: 0,
    answered_count: 0,
    no_answer_count: 0,
    busy_count: 0,
    wrong_number_count: 0,
    avg_sig_overall: null,
    unique_callers: 0
  }
}
