import pool from '../index.js'

export async function getCampaignById(id) {
  const { rows } = await pool.query(
    `SELECT id, name, province, description,
            TO_CHAR(event_date, 'YYYY-MM-DD"T"HH24:MI') AS event_date,
            TO_CHAR(event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date,
            created_at
     FROM act_event_cache WHERE id = $1 AND type IN ('campaign', 'event')`,
    [id]
  )
  return rows[0] || null
}

export async function getCampaigns(province = null) {
  const params = []
  let query = `
    SELECT
      c.id, c.act_event_id, c.name, c.province, c.description, c.image_url,
      TO_CHAR(c.event_date, 'YYYY-MM-DD"T"HH24:MI') AS event_date, c.created_at,
      COUNT(DISTINCT cl.id) AS call_count
    FROM act_event_cache c
    LEFT JOIN calling_logs cl ON cl.campaign_id = c.id
    WHERE c.type IN ('campaign', 'event')`

  if (province) {
    params.push(province)
    query += ` AND c.province = $${params.length}`
  }

  query += ` GROUP BY c.id ORDER BY c.created_at DESC`
  const { rows } = await pool.query(query, params)
  return rows
}

export async function getCampaignsByProvince(province) {
  const { rows } = await pool.query(
    `SELECT id, name, province, description, created_at
     FROM act_event_cache
     WHERE type IN ('campaign', 'event') AND province = $1
     ORDER BY created_at DESC`,
    [province]
  )
  return rows
}

export async function createCampaign(data, createdBy) {
  const { id, name, description, province, event_date, event_end_date } = data
  if (id) {
    await pool.query(
      `INSERT INTO act_event_cache (id, type, name, description, province, event_date, event_end_date, guild_id, synced_at)
       VALUES ($1, 'campaign', $2, $3, $4, $5, $6, $7, NOW())`,
      [id, name, description || null, province || null, event_date || null, event_end_date || null, process.env.GUILD_ID || '1']
    )
    return id
  }
  const { rows } = await pool.query(
    `INSERT INTO act_event_cache (type, name, description, province, event_date, event_end_date, guild_id, synced_at)
     VALUES ('campaign', $1, $2, $3, $4, $5, $6, NOW())
     RETURNING id`,
    [name, description || null, province || null, event_date || null, event_end_date || null, process.env.GUILD_ID || '1']
  )
  return rows[0].id
}

export async function renameCampaignId(oldId, newId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE act_event_cache SET id = $1 WHERE id = $2 AND type = 'campaign'`, [newId, oldId])
    await client.query(`UPDATE calling_assignments SET campaign_id = $1 WHERE campaign_id = $2`, [newId, oldId])
    await client.query(`UPDATE calling_logs SET campaign_id = $1 WHERE campaign_id = $2`, [newId, oldId])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function updateCampaign(id, data) {
  const { name, description, province, event_date, event_end_date } = data
  await pool.query(
    `UPDATE act_event_cache
     SET name = $1, description = $2, province = $3, event_date = $4, event_end_date = $5, updated_at = NOW()
     WHERE id = $6 AND type = 'campaign'`,
    [name, description || null, province || null, event_date || null, event_end_date || null, id]
  )
}

export async function deleteCampaign(id) {
  await pool.query(
    `DELETE FROM act_event_cache WHERE id = $1 AND type = 'campaign'`,
    [id]
  )
}

export async function getCampaignSummary(campaignId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(DISTINCT ca.member_id) AS total_assigned,
       COUNT(DISTINCT cl.member_id) AS total_called,
       SUM(CASE WHEN cl.status = 'answered' THEN 1 ELSE 0 END) AS answered_count
     FROM act_event_cache cc
     LEFT JOIN calling_assignments ca ON ca.campaign_id = cc.id
     LEFT JOIN calling_logs cl ON cl.campaign_id = cc.id
     WHERE cc.id = $1 AND cc.type IN ('campaign', 'event')`,
    [campaignId]
  )
  return rows[0] || { total_assigned: 0, total_called: 0, answered_count: 0 }
}
