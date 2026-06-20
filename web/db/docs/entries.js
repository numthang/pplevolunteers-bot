import pool from '../index.js'

export async function getEntriesByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT
       e.id, e.project_id, e.member_discord_id, e.item_type,
       e.description, e.amount, e.override_data, e.status,
       e.sign_token, e.token_expires_at, e.signed_at, e.printed_at, e.pdf_url,
       e.payer_discord_id, e.payer_sign_token, e.payer_signed_at,
       m.display_name, m.firstname, m.lastname, m.member_id,
       n.first_name AS ngs_first_name, n.last_name AS ngs_last_name
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     LEFT JOIN dc_members m ON m.discord_id = e.member_discord_id AND m.guild_id = p.guild_id
     LEFT JOIN ngs_member_cache n ON n.source_id = m.member_id
     WHERE e.project_id = $1
     ORDER BY m.display_name, e.item_type`,
    [projectId]
  )
  return rows
}

export async function getEntryByToken(token) {
  const { rows } = await pool.query(
    `SELECT
       e.*,
       CASE WHEN e.sign_token = $1 THEN 'recipient' ELSE 'payer' END AS signer_role,
       CASE WHEN e.sign_token = $1
            THEN e.token_expires_at
            ELSE e.payer_token_expires_at
       END AS signer_token_expires_at,
       p.guild_id, p.is_mobile, p.participant_count, p.budget,
       p.act_event_cache_id,
       ev.name AS event_name, ev.province, ev.location,
       TO_CHAR(ev.event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
       TO_CHAR(ev.event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date,
       m.display_name, m.firstname, m.lastname, m.member_id,
       m.bank_name, m.account_no, m.account_holder,
       (m.id_card_image IS NOT NULL) AS has_id_card,
       n.identification_number, n.title,
       n.first_name AS ngs_first_name, n.last_name AS ngs_last_name,
       n.home_house_number, n.home_alley, n.home_road,
       n.home_district, n.home_amphure, n.home_province, n.home_zip_code
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     LEFT JOIN dc_members m ON m.discord_id = e.member_discord_id AND m.guild_id = p.guild_id
     LEFT JOIN ngs_member_cache n ON n.source_id = m.member_id
     WHERE e.sign_token = $1 OR e.payer_sign_token = $1`,
    [token]
  )
  return rows[0] || null
}

export async function createEntries(entries) {
  if (!entries.length) return
  const values = entries.map((e, i) => {
    const base = i * 5
    return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`
  }).join(', ')
  const params = entries.flatMap(e => [
    e.projectId, e.memberDiscordId, e.itemType, e.description, e.amount
  ])
  await pool.query(
    `INSERT INTO docs_activity_entries (project_id, member_discord_id, item_type, description, amount)
     VALUES ${values}`,
    params
  )
}

export async function setTokenExpiry(projectId, expiresAt) {
  await pool.query(
    `UPDATE docs_activity_entries SET token_expires_at = $2 WHERE project_id = $1`,
    [projectId, expiresAt]
  )
}

/** ตั้ง payer และสร้าง payer_sign_token สำหรับทุก entry ใน project */
export async function setProjectPayer(projectId, payerDiscordId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE docs_projects SET payer_discord_id = $2 WHERE id = $1`,
      [projectId, payerDiscordId]
    )
    const { rows } = await client.query(
      `UPDATE docs_activity_entries
       SET payer_discord_id      = $2,
           payer_sign_token       = gen_random_uuid(),
           payer_token_expires_at = token_expires_at
       WHERE project_id = $1
       RETURNING id, payer_sign_token`,
      [projectId, payerDiscordId]
    )
    await client.query('COMMIT')
    return rows  // [{ id, payer_sign_token }]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function signEntry({ token, signatureBase64, discordId, ip, role = 'recipient' }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let entryId
    if (role === 'recipient') {
      const { rows } = await client.query(
        `UPDATE docs_activity_entries
         SET status = 'signed', signed_at = NOW()
         WHERE sign_token = $1
           AND (token_expires_at IS NULL OR token_expires_at > NOW())
         RETURNING id`,
        [token]
      )
      if (!rows[0]) throw new Error('token invalid or expired')
      entryId = rows[0].id
    } else {
      const { rows } = await client.query(
        `UPDATE docs_activity_entries
         SET payer_signed_at = NOW()
         WHERE payer_sign_token = $1
           AND (payer_token_expires_at IS NULL OR payer_token_expires_at > NOW())
         RETURNING id`,
        [token]
      )
      if (!rows[0]) throw new Error('token invalid or expired')
      entryId = rows[0].id
    }

    await client.query(
      `INSERT INTO docs_signatures (entry_id, signature_base64, signed_by_discord_id, signed_ip, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [entryId, signatureBase64, discordId, ip, role]
    )

    await client.query('COMMIT')
    return entryId
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function markPrinted(entryId) {
  await pool.query(
    `UPDATE docs_activity_entries SET status = 'printed', printed_at = NOW() WHERE id = $1`,
    [entryId]
  )
}

export async function getEntryById(id) {
  const { rows } = await pool.query(
    `SELECT
       e.*,
       p.guild_id, p.is_mobile, p.participant_count, p.budget, p.project_name,
       p.act_event_cache_id,
       ev.name AS event_name, ev.province, ev.location,
       TO_CHAR(ev.event_date,     'YYYY-MM-DD"T"HH24:MI') AS event_date,
       TO_CHAR(ev.event_end_date, 'YYYY-MM-DD"T"HH24:MI') AS event_end_date,
       m.display_name, m.firstname, m.lastname, m.member_id,
       m.id_card_image,
       n.identification_number, n.title,
       n.first_name AS ngs_first_name, n.last_name AS ngs_last_name,
       n.home_house_number, n.home_alley, n.home_road,
       n.home_district, n.home_amphure, n.home_province, n.home_zip_code,
       pm.display_name AS payer_display_name
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     LEFT JOIN dc_members m  ON m.discord_id  = e.member_discord_id AND m.guild_id = p.guild_id
     LEFT JOIN dc_members pm ON pm.discord_id = e.payer_discord_id  AND pm.guild_id = p.guild_id
     LEFT JOIN ngs_member_cache n ON n.source_id = m.member_id
     WHERE e.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function updateEntry(id, { itemType, description, amount }) {
  await pool.query(
    `UPDATE docs_activity_entries SET
       item_type   = COALESCE($2, item_type),
       description = $3,
       amount      = COALESCE($4, amount)
     WHERE id = $1`,
    [id, itemType ?? null, description ?? null, amount ?? null]
  )
}

export async function deleteEntry(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM docs_activity_entries WHERE id = $1 AND status = 'pending'`,
    [id]
  )
  return rowCount > 0
}

export async function getSignatureByEntryId(entryId, role = 'recipient') {
  const { rows } = await pool.query(
    `SELECT signature_base64, signed_by_discord_id, created_at
     FROM docs_signatures WHERE entry_id = $1 AND role = $2
     ORDER BY created_at DESC LIMIT 1`,
    [entryId, role]
  )
  return rows[0] || null
}

export async function getEntryByIdSimple(id) {
  const { rows } = await pool.query(
    `SELECT e.*, p.guild_id FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id WHERE e.id = $1`,
    [id]
  )
  return rows[0] || null
}
