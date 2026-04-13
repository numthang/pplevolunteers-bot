import pool from '../index.js'

/**
 * Get campaign by ID
 */
export async function getCampaignById(id) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_campaigns WHERE id = ?`,
    [id]
  )
  return rows[0] || null
}

/**
 * Get all campaigns, optionally filtered by province
 */
export async function getCampaigns(province = null) {
  let query = `SELECT * FROM calling_campaigns`
  const params = []

  if (province) {
    query += ` WHERE province = ?`
    params.push(province)
  }

  query += ` ORDER BY created_at DESC`

  const [rows] = await pool.query(query, params)
  return rows
}

/**
 * Get campaigns by province
 */
export async function getCampaignsByProvince(province) {
  const [rows] = await pool.query(
    `SELECT * FROM calling_campaigns
     WHERE province = ?
     ORDER BY created_at DESC`,
    [province]
  )
  return rows
}

/**
 * Create campaign
 */
export async function createCampaign(data, createdBy) {
  const { name, description, province, act_id } = data
  const [result] = await pool.query(
    `INSERT INTO calling_campaigns
      (name, description, province, act_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [name, description || null, province || null, act_id || null, createdBy]
  )
  return result.insertId
}

/**
 * Update campaign
 */
export async function updateCampaign(id, data) {
  const { name, description, province, act_id } = data
  await pool.query(
    `UPDATE calling_campaigns
     SET name = ?, description = ?, province = ?, act_id = ?
     WHERE id = ?`,
    [name, description || null, province || null, act_id || null, id]
  )
}

/**
 * Delete campaign
 */
export async function deleteCampaign(id) {
  await pool.query(`DELETE FROM calling_campaigns WHERE id = ?`, [id])
}

/**
 * Get campaign summary (member count, assigned count, called count)
 */
export async function getCampaignSummary(campaignId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(DISTINCT ca.member_id) AS total_assigned,
       COUNT(DISTINCT cl.member_id) AS total_called,
       SUM(CASE WHEN cl.status = 'answered' THEN 1 ELSE 0 END) AS answered_count
     FROM calling_campaigns cc
     LEFT JOIN calling_assignments ca ON ca.campaign_id = cc.id
     LEFT JOIN calling_logs cl ON cl.campaign_id = cc.id
     WHERE cc.id = ?`,
    [campaignId]
  )
  return rows[0] || { total_assigned: 0, total_called: 0, answered_count: 0 }
}
