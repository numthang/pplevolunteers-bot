import pool from '../index.js'

export async function getCampaignById(id) {
  const [rows] = await pool.query(
    `SELECT id, name, province, description, DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date, created_at
     FROM act_event_cache WHERE id = ? AND type = 'campaign'`,
    [id]
  )
  return rows[0] || null
}

export async function getCampaigns(province = null) {
  let query = `
    SELECT
      c.id, c.name, c.province, c.description, DATE_FORMAT(c.event_date, '%Y-%m-%d') AS event_date, c.created_at,
      COUNT(DISTINCT cl.id) AS call_count
    FROM act_event_cache c
    LEFT JOIN calling_logs cl ON cl.campaign_id = c.id
    WHERE c.type = 'campaign'`
  const params = []

  if (province) {
    query += ` AND c.province = ?`
    params.push(province)
  }

  query += ` GROUP BY c.id ORDER BY c.created_at DESC`
  const [rows] = await pool.query(query, params)
  return rows
}

export async function getCampaignsByProvince(province) {
  const [rows] = await pool.query(
    `SELECT id, name, province, description, created_at
     FROM act_event_cache
     WHERE type = 'campaign' AND province = ?
     ORDER BY created_at DESC`,
    [province]
  )
  return rows
}

export async function createCampaign(data, createdBy) {
  const { id, name, description, province, event_date } = data
  if (id) {
    await pool.query(
      `INSERT INTO act_event_cache (id, type, name, description, province, event_date, guild_id, synced_at)
       VALUES (?, 'campaign', ?, ?, ?, ?, ?, NOW())`,
      [id, name, description || null, province || null, event_date || null, process.env.GUILD_ID || '1']
    )
    return id
  }
  const [result] = await pool.query(
    `INSERT INTO act_event_cache (type, name, description, province, event_date, guild_id, synced_at)
     VALUES ('campaign', ?, ?, ?, ?, ?, NOW())`,
    [name, description || null, province || null, event_date || null, process.env.GUILD_ID || '1']
  )
  return result.insertId
}

export async function renameCampaignId(oldId, newId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query(`UPDATE act_event_cache SET id = ? WHERE id = ? AND type = 'campaign'`, [newId, oldId])
    await conn.query(`UPDATE calling_assignments SET campaign_id = ? WHERE campaign_id = ?`, [newId, oldId])
    await conn.query(`UPDATE calling_logs SET campaign_id = ? WHERE campaign_id = ?`, [newId, oldId])
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function updateCampaign(id, data) {
  const { name, description, province, event_date } = data
  await pool.query(
    `UPDATE act_event_cache
     SET name = ?, description = ?, province = ?, event_date = ?, updated_at = NOW()
     WHERE id = ? AND type = 'campaign'`,
    [name, description || null, province || null, event_date || null, id]
  )
}

export async function deleteCampaign(id) {
  await pool.query(
    `DELETE FROM act_event_cache WHERE id = ? AND type = 'campaign'`,
    [id]
  )
}

export async function getCampaignSummary(campaignId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(DISTINCT ca.member_id) AS total_assigned,
       COUNT(DISTINCT cl.member_id) AS total_called,
       SUM(CASE WHEN cl.status = 'answered' THEN 1 ELSE 0 END) AS answered_count
     FROM act_event_cache cc
     LEFT JOIN calling_assignments ca ON ca.campaign_id = cc.id
     LEFT JOIN calling_logs cl ON cl.campaign_id = cc.id
     WHERE cc.id = ? AND cc.type = 'campaign'`,
    [campaignId]
  )
  return rows[0] || { total_assigned: 0, total_called: 0, answered_count: 0 }
}
