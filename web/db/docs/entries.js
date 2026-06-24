import pool from '../index.js'
import { getPayersForEvent } from './payers.js'

/**
 * เติม payer_display_name + payer_position จาก pool ผู้จ่าย (role-based position มาก่อน docs_payers)
 * - role-based payer (เช่น ผู้ประสานงานจังหวัด) ไม่มีแถวใน docs_payers → ต้องดึง position จาก role
 * - payer ที่หลุด pool แล้ว (role ถูกถอด) → คง fallback จาก JOIN (dc_members/docs_payers)
 * rows ทุกแถวอยู่ project เดียว → ใช้ guildId/province ร่วมกัน
 */
async function enrichPayerInfo(rows, guildId, province) {
  const payerIds = [...new Set(rows.map(r => r.payer_discord_id).filter(Boolean))]
  if (!payerIds.length || !province) return rows
  const payers = await getPayersForEvent(guildId, province)
  const byId = Object.fromEntries(payers.map(p => [p.discord_id, p]))
  for (const r of rows) {
    const info = byId[r.payer_discord_id]
    if (info) {
      const realName = (info.firstname && info.lastname) ? `${info.firstname} ${info.lastname}` : null
      r.payer_display_name = realName ?? info.display_name ?? r.payer_display_name
      r.payer_position     = info.position ?? r.payer_position
    }
  }
  return rows
}

export async function getEntriesByProject(projectId) {
  const { rows } = await pool.query(
    `SELECT
       e.id, e.project_id, e.member_discord_id, e.item_type,
       e.description, e.amount, e.override_data, e.status,
       e.sign_token, e.token_expires_at, e.signed_at, e.printed_at, e.pdf_url,
       e.payer_discord_id, e.payer_sign_token, e.payer_signed_at,
       p.guild_id, ev.province,
       m.display_name, m.username, m.firstname, m.lastname, m.member_id,
       n.first_name AS ngs_first_name, n.last_name AS ngs_last_name,
       COALESCE(
         NULLIF(TRIM(CONCAT(np.first_name, ' ', np.last_name)), ''),
         NULLIF(TRIM(CONCAT(pm.firstname,  ' ', pm.lastname)),  ''),
         dp.display_name,
         pm.display_name
       ) AS payer_display_name,
       dp.position AS payer_position
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     LEFT JOIN dc_members m  ON m.discord_id  = e.member_discord_id AND m.guild_id = p.guild_id
     LEFT JOIN dc_members pm ON pm.discord_id = e.payer_discord_id  AND pm.guild_id = p.guild_id
     LEFT JOIN docs_payers dp ON dp.discord_id = e.payer_discord_id AND dp.guild_id = p.guild_id
     LEFT JOIN ngs_member_cache n  ON n.source_id  = m.member_id
     LEFT JOIN ngs_member_cache np ON np.source_id = pm.member_id
     WHERE e.project_id = $1
     ORDER BY m.display_name, e.item_type`,
    [projectId]
  )
  if (!rows.length) return rows
  return enrichPayerInfo(rows, rows[0].guild_id, rows[0].province)
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
       n.home_district, n.home_amphure, n.home_province, n.home_zip_code,
       n.mobile_number, n.road
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     LEFT JOIN dc_members m ON m.discord_id = e.member_discord_id AND m.guild_id = p.guild_id
     LEFT JOIN ngs_member_cache n ON n.source_id = m.member_id
     WHERE e.sign_token = $1 OR e.payer_sign_token = $1`,
    [token]
  )
  if (!rows[0]) return null
  await enrichPayerInfo(rows, rows[0].guild_id, rows[0].province)
  return rows[0]
}

export async function createEntries(entries) {
  if (!entries.length) return
  const values = entries.map((e, i) => {
    const base = i * 6
    return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6})`
  }).join(', ')
  const params = entries.flatMap(e => [
    e.projectId, e.memberDiscordId, e.itemType, e.description, e.amount,
    e.overrideData ? JSON.stringify(e.overrideData) : null,
  ])
  await pool.query(
    `INSERT INTO docs_activity_entries (project_id, member_discord_id, item_type, description, amount, override_data)
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

/**
 * auto-assign payer ให้ entry ที่ "ยังไม่มี payer" — ไม่แตะ entry ที่ตั้งแล้ว/เซ็นแล้ว
 * default = payer คนแรกใน pool จังหวัดนั้น (province_coordinator → regional → docs_payers)
 * ถ้า default == recipient ของกลุ่มนั้น → สลับไปคนถัดไปใน pool ที่ ≠ recipient
 * ข้าม entry ที่ยังไม่มีผู้รับ (member_discord_id IS NULL) — resolve ตอนกำหนดผู้รับทีหลัง
 * เรียกอัตโนมัติหลังสร้าง entry + ตอนเปิดหน้า (idempotent)
 * @param {number}      projectId
 * @param {string}      guildId
 * @param {string|null} eventProvince
 * @returns {Promise<Array<{id, payer_sign_token, payer_discord_id}>>}
 */
export async function autoAssignPayers(projectId, guildId, eventProvince) {
  if (!eventProvince) return []             // event ไม่มีจังหวัด → ไม่ auto-assign (กันเลือกผิดจังหวัด)
  const payerPool = await getPayersForEvent(guildId, eventProvince)
  if (!payerPool.length) return []          // ไม่มีผู้จ่ายในจังหวัดนี้ → ข้าม

  // default = payer ที่ตั้งไว้ระดับโครงการ (จาก dropdown บนสุด) → ถ้าไม่มีใช้ pool[0] (ผู้ประสานงานจังหวัด)
  const { rows: projRows } = await pool.query(
    `SELECT payer_discord_id FROM docs_projects WHERE id = $1`,
    [projectId]
  )
  const projectDefault = projRows[0]?.payer_discord_id
  const inPool = projectDefault && payerPool.some(p => p.discord_id === projectDefault)
  const defaultPayer = inPool ? projectDefault : payerPool[0].discord_id

  const { rows: entries } = await pool.query(
    `SELECT id, member_discord_id FROM docs_activity_entries
     WHERE project_id = $1 AND payer_discord_id IS NULL AND member_discord_id IS NOT NULL`,
    [projectId]
  )
  if (!entries.length) return []            // ทุก entry มี payer แล้ว / ยังไม่มีผู้รับ

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const results = []
    for (const entry of entries) {
      let resolved = defaultPayer
      if (entry.member_discord_id === defaultPayer) {
        const fallback = payerPool.find(p => p.discord_id !== entry.member_discord_id)
        resolved = fallback?.discord_id ?? null   // ทั้ง pool เป็นผู้รับเอง → ปล่อยว่าง
      }
      if (!resolved) continue
      const { rows } = await client.query(
        `UPDATE docs_activity_entries
         SET payer_discord_id      = $2,
             payer_sign_token       = gen_random_uuid(),
             payer_token_expires_at = token_expires_at
         WHERE id = $1
         RETURNING id, payer_sign_token, payer_discord_id`,
        [entry.id, resolved]
      )
      if (rows[0]) results.push(rows[0])
    }

    await client.query('COMMIT')
    return results
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * ตั้ง payer ให้ "ทุก entry ของผู้รับคนหนึ่ง" ในโครงการ (manual override จาก dropdown)
 * - payer ต้อง ≠ recipient (ผู้รับเซ็นจ่ายให้ตัวเองไม่ได้)
 * - ถ้า payer เปลี่ยนจากคนเดิม → gen token ใหม่ + reset ลายเซ็น payer เดิม (ถ้าเซ็นแล้ว)
 * @param {number} projectId
 * @param {string} recipientDiscordId  ผู้รับเงิน (key ของกลุ่ม)
 * @param {string} payerDiscordId      ผู้จ่ายคนใหม่
 * @returns {Promise<Array<{id, payer_sign_token, payer_discord_id}>>}
 */
export async function setRecipientGroupPayer(projectId, recipientDiscordId, payerDiscordId) {
  if (payerDiscordId === recipientDiscordId) {
    throw new Error('ผู้จ่ายต้องไม่ใช่ผู้รับเงินคนเดียวกัน')
  }

  const { rows: entries } = await pool.query(
    `SELECT id, payer_discord_id, payer_signed_at FROM docs_activity_entries
     WHERE project_id = $1 AND member_discord_id = $2`,
    [projectId, recipientDiscordId]
  )
  if (!entries.length) return []

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const results = []
    for (const entry of entries) {
      const changed = entry.payer_discord_id !== payerDiscordId
      if (!changed) { results.push({ id: entry.id, payer_discord_id: payerDiscordId, payer_sign_token: null }); continue }

      // payer เปลี่ยน → ลบลายเซ็น payer เดิม (ถ้ามี) ก่อน gen token ใหม่
      if (entry.payer_signed_at) {
        await client.query(`DELETE FROM docs_signatures WHERE entry_id = $1 AND role = 'payer'`, [entry.id])
      }
      const { rows } = await client.query(
        `UPDATE docs_activity_entries
         SET payer_discord_id      = $2,
             payer_sign_token       = gen_random_uuid(),
             payer_token_expires_at = token_expires_at,
             payer_signed_at        = NULL
         WHERE id = $1
         RETURNING id, payer_sign_token, payer_discord_id`,
        [entry.id, payerDiscordId]
      )
      if (rows[0]) results.push(rows[0])
    }

    await client.query('COMMIT')
    return results
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * ตั้ง payer "ทั้งโครงการ" (จาก dropdown บนสุด) — เป็น project default + apply ทุก entry
 * - เขียน docs_projects.payer_discord_id = project default (ไว้ให้ entry ใหม่ inherit)
 * - ทุก entry ที่มีผู้รับ: payer = payerDiscordId · ถ้า == recipient → คนถัดไปใน pool (auto-swap)
 * - ข้าม entry ที่ไม่มีผู้รับ (member_discord_id NULL)
 * - payer เปลี่ยน + เคยเซ็น → reset ลายเซ็น payer เดิม
 * @returns {Promise<Array<{id, payer_sign_token, payer_discord_id}>>}
 */
export async function setProjectPayer(projectId, payerDiscordId, guildId, eventProvince) {
  const payerPool = await getPayersForEvent(guildId, eventProvince)
  if (!payerPool.some(p => p.discord_id === payerDiscordId)) {
    throw new Error('ผู้จ่ายที่เลือกไม่มีสิทธิ์จ่ายในจังหวัดนี้')
  }

  const { rows: entries } = await pool.query(
    `SELECT id, member_discord_id, payer_discord_id, payer_signed_at FROM docs_activity_entries
     WHERE project_id = $1 AND member_discord_id IS NOT NULL`,
    [projectId]
  )

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE docs_projects SET payer_discord_id = $2 WHERE id = $1`,
      [projectId, payerDiscordId]
    )

    const results = []
    for (const entry of entries) {
      // ผู้รับ == payer → สลับเป็นคนถัดไปใน pool ที่ ≠ ผู้รับ (auto-swap)
      let resolved = payerDiscordId
      if (entry.member_discord_id === payerDiscordId) {
        resolved = payerPool.find(p => p.discord_id !== entry.member_discord_id)?.discord_id ?? null
      }
      if (!resolved) continue
      if (entry.payer_discord_id === resolved) {
        results.push({ id: entry.id, payer_discord_id: resolved, payer_sign_token: null }); continue
      }

      if (entry.payer_signed_at) {
        await client.query(`DELETE FROM docs_signatures WHERE entry_id = $1 AND role = 'payer'`, [entry.id])
      }
      const { rows } = await client.query(
        `UPDATE docs_activity_entries
         SET payer_discord_id      = $2,
             payer_sign_token       = gen_random_uuid(),
             payer_token_expires_at = token_expires_at,
             payer_signed_at        = NULL
         WHERE id = $1
         RETURNING id, payer_sign_token, payer_discord_id`,
        [entry.id, resolved]
      )
      if (rows[0]) results.push(rows[0])
    }

    await client.query('COMMIT')
    return results
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * เปลี่ยน payer ของ entry เดียว (ใช้ตอนแก้ผู้รับแล้วผู้รับ == payer → สลับเป็นคนถัดไป)
 * gen token ใหม่ + reset ลายเซ็น payer เดิมถ้าเซ็นแล้ว
 */
export async function reassignEntryPayer(entryId, payerDiscordId) {
  await pool.query(`DELETE FROM docs_signatures WHERE entry_id = $1 AND role = 'payer'`, [entryId])
  const { rows } = await pool.query(
    `UPDATE docs_activity_entries
     SET payer_discord_id      = $2,
         payer_sign_token       = gen_random_uuid(),
         payer_token_expires_at = token_expires_at,
         payer_signed_at        = NULL
     WHERE id = $1
     RETURNING id, payer_sign_token, payer_discord_id`,
    [entryId, payerDiscordId]
  )
  return rows[0] || null
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
       n.mobile_number, n.road,
       COALESCE(
         NULLIF(TRIM(CONCAT(np.first_name, ' ', np.last_name)), ''),
         NULLIF(TRIM(CONCAT(pm.firstname,  ' ', pm.lastname)),  ''),
         dp.display_name,
         pm.display_name
       ) AS payer_display_name,
       dp.position AS payer_position
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     LEFT JOIN dc_members m  ON m.discord_id  = e.member_discord_id AND m.guild_id = p.guild_id
     LEFT JOIN dc_members pm ON pm.discord_id = e.payer_discord_id  AND pm.guild_id = p.guild_id
     LEFT JOIN docs_payers dp ON dp.discord_id = e.payer_discord_id AND dp.guild_id = p.guild_id
     LEFT JOIN ngs_member_cache n  ON n.source_id  = m.member_id
     LEFT JOIN ngs_member_cache np ON np.source_id = pm.member_id
     WHERE e.id = $1`,
    [id]
  )
  if (!rows[0]) return null
  await enrichPayerInfo(rows, rows[0].guild_id, rows[0].province)
  return rows[0]
}

export async function updateEntry(id, { itemType, description, amount, memberDiscordId }) {
  await pool.query(
    `UPDATE docs_activity_entries SET
       item_type         = COALESCE($2, item_type),
       description       = $3,
       amount            = COALESCE($4, amount),
       member_discord_id = COALESCE($5, member_discord_id)
     WHERE id = $1`,
    [id, itemType ?? null, description ?? null, amount ?? null, memberDiscordId ?? null]
  )
}

export async function resetRecipientSignature(id) {
  await pool.query(
    `UPDATE docs_activity_entries SET status = 'pending', signed_at = NULL WHERE id = $1`,
    [id]
  )
  await pool.query(
    `DELETE FROM docs_signatures WHERE entry_id = $1 AND role = 'recipient'`,
    [id]
  )
}

export async function deleteEntry(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM docs_activity_entries WHERE id = $1`,
    [id]
  )
  return rowCount > 0
}

export async function deleteAllEntriesByProject(projectId) {
  const { rowCount } = await pool.query(
    `DELETE FROM docs_activity_entries WHERE project_id = $1`,
    [projectId]
  )
  return rowCount
}

/**
 * รายการที่ user คนนี้ต้องเซ็น (สำหรับหน้า /docs/pending — คนทั่วไปก็ใช้ได้)
 * - recipient: entry ที่ตัวเองเป็นผู้รับเงิน + ยังไม่เซ็น
 * - payer:     entry ที่ตัวเองเป็นผู้จ่ายเงิน + มี token แล้ว + ยังไม่เซ็น
 * @returns {Promise<{recipient: Array, payer: Array}>}
 */
export async function getPendingSignaturesForUser(discordId, guildId) {
  const { rows: recipient } = await pool.query(
    `SELECT e.id, e.item_type, e.amount, e.description,
            e.sign_token AS token, e.token_expires_at AS expires_at,
            ev.name AS event_name, ev.province,
            TO_CHAR(ev.event_date, 'YYYY-MM-DD"T"HH24:MI') AS event_date
     FROM docs_activity_entries e
     JOIN docs_projects p   ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     WHERE p.guild_id = $1 AND e.member_discord_id = $2 AND e.signed_at IS NULL
     ORDER BY ev.event_date DESC NULLS LAST, e.item_type`,
    [guildId, discordId]
  )
  const { rows: payer } = await pool.query(
    `SELECT e.id, e.item_type, e.amount, e.description,
            e.payer_sign_token AS token, e.payer_token_expires_at AS expires_at,
            ev.name AS event_name, ev.province,
            TO_CHAR(ev.event_date, 'YYYY-MM-DD"T"HH24:MI') AS event_date
     FROM docs_activity_entries e
     JOIN docs_projects p   ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     WHERE p.guild_id = $1 AND e.payer_discord_id = $2
       AND e.payer_sign_token IS NOT NULL AND e.payer_signed_at IS NULL
     ORDER BY ev.event_date DESC NULLS LAST, e.item_type`,
    [guildId, discordId]
  )
  return { recipient, payer }
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
    `SELECT e.*, p.guild_id, ev.province
     FROM docs_activity_entries e
     JOIN docs_projects p ON p.id = e.project_id
     JOIN act_event_cache ev ON ev.id = p.act_event_cache_id
     WHERE e.id = $1`,
    [id]
  )
  return rows[0] || null
}
