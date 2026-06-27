/**
 * Case (เรื่องร้องเรียน) — web-side DB layer (ESM)
 *
 * ⚠️ กันหลุด PII ระดับโครงสร้าง: แยก query 2 ตัว
 *    - getCaseByRefPublic  → เฉพาะ field ปลอดภัย (status + public notes) สำหรับหน้า public
 *    - getCaseByRefFull    → ทุก field (PII) เรียก "หลังผ่าน gate canManageCases + scope" เท่านั้น
 *
 * ทุก query filter ด้วย guild_id · province scope filter ที่ list/full
 * ref format เดียวกับ db/case.js (bot): <รหัสมหาดไทย>-<พ.ศ.2หลัก>-<random4hex>
 */

import { randomBytes } from 'crypto'
import pool from './index.js'
import { provinceToCode } from '../lib/provinceCode.js'

function beYear2() {
  return String((new Date().getFullYear() + 543) % 100).padStart(2, '0')
}

/** สร้าง ref ไม่ซ้ำ (retry กรณีชน) */
export async function generateRef(province) {
  const code = provinceToCode(province) || '00'
  const yy = beYear2()
  for (let i = 0; i < 8; i++) {
    const ref = `${code}-${yy}-${randomBytes(2).toString('hex').toUpperCase()}`
    const { rows } = await pool.query(`SELECT 1 FROM cases WHERE ref = $1`, [ref])
    if (rows.length === 0) return ref
  }
  throw new Error('generateRef: ไม่สามารถสร้าง ref ที่ไม่ซ้ำได้')
}

/**
 * สร้างเคสจาก public web form
 * @returns {object} แถวที่สร้าง (มี ref)
 */
export async function createCase(guildId, data) {
  const {
    province, category = null, title = null, detail = null, source = 'web',
    complainant_name, complainant_phone, complainant_line_id = null,
    consent_at = null, intake_ip = null, created_by = null,
  } = data
  const ref = await generateRef(province)
  const { rows } = await pool.query(
    `INSERT INTO cases
       (guild_id, ref, province, category, title, detail, source, status,
        complainant_name, complainant_phone, complainant_line_id,
        consent_at, intake_ip, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [guildId, ref, province, category, title, detail, source,
     complainant_name, complainant_phone, complainant_line_id,
     consent_at, intake_ip, created_by],
  )
  return rows[0]
}

/**
 * นับเคสที่ส่งจากเบอร์นี้ภายใน N ชั่วโมง (rate limit)
 */
export async function countRecentByPhone(phone, hours = 24) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM cases
     WHERE complainant_phone = $1 AND created_at > NOW() - ($2 || ' hours')::interval`,
    [phone, String(hours)],
  )
  return rows[0].n
}

/** นับเคสจาก IP นี้ภายใน N ชั่วโมง (rate limit) */
export async function countRecentByIp(ip, hours = 24) {
  if (!ip) return 0
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM cases
     WHERE intake_ip = $1 AND created_at > NOW() - ($2 || ' hours')::interval`,
    [ip, String(hours)],
  )
  return rows[0].n
}

export async function getCaseConfig(guildId) {
  const { rows } = await pool.query(`SELECT * FROM case_config WHERE guild_id = $1`, [guildId])
  return rows[0] || null
}

export async function setDiscordThreadId(caseId, threadId) {
  await pool.query(
    `UPDATE cases SET discord_thread_id = $2, updated_at = NOW() WHERE id = $1`,
    [caseId, threadId],
  )
}

/**
 * 🔓 PUBLIC projection — เฉพาะ field ที่เปิดสาธารณะได้ (ไม่มี PII)
 * ใช้บนหน้า /case/[ref] ที่ไม่ต้อง login
 */
export async function getCaseByRefPublic(ref) {
  const { rows } = await pool.query(
    `SELECT ref, province, category, status, close_reason, created_at, updated_at
     FROM cases WHERE ref = $1`,
    [ref],
  )
  const row = rows[0]
  if (!row) return null
  const { rows: notes } = await pool.query(
    `SELECT body, created_at FROM case_notes
     WHERE case_id = (SELECT id FROM cases WHERE ref = $1) AND is_public = TRUE
     ORDER BY created_at`,
    [ref],
  )
  return { ...row, publicNotes: notes }
}

/**
 * 🔒 FULL — ทุก field รวม PII · เรียกหลังผ่าน gate (canManageCases + scope) เท่านั้น
 */
export async function getCaseByRefFull(guildId, ref) {
  const { rows } = await pool.query(
    `SELECT * FROM cases WHERE guild_id = $1 AND ref = $2`,
    [guildId, ref],
  )
  return rows[0] || null
}

export async function getCaseNotes(caseId) {
  const { rows } = await pool.query(
    `SELECT * FROM case_notes WHERE case_id = $1 ORDER BY created_at`,
    [caseId],
  )
  return rows
}

export async function getAssignees(caseId) {
  const { rows } = await pool.query(
    `SELECT discord_id, assigned_at FROM case_assignees WHERE case_id = $1 ORDER BY assigned_at`,
    [caseId],
  )
  return rows
}

/** assignees พร้อมชื่อ (JOIN dc_members) — สำหรับแสดงในหน้า workspace */
export async function getAssigneesWithNames(caseId, guildId) {
  const { rows } = await pool.query(
    `SELECT a.discord_id, a.assigned_at,
            COALESCE(m.display_name, m.username, a.discord_id) AS name
     FROM case_assignees a
     LEFT JOIN dc_members m ON m.discord_id = a.discord_id AND m.guild_id = $2
     WHERE a.case_id = $1 ORDER BY a.assigned_at`,
    [caseId, guildId],
  )
  return rows
}

export async function getAttachments(caseId) {
  const { rows } = await pool.query(
    `SELECT id, file_path, original_name, mime, created_at
     FROM case_attachments WHERE case_id = $1 ORDER BY created_at`,
    [caseId],
  )
  return rows
}

export async function getAttachmentById(attId) {
  const { rows } = await pool.query(
    `SELECT a.*, c.ref, c.province, c.guild_id AS case_guild_id
     FROM case_attachments a JOIN cases c ON c.id = a.case_id
     WHERE a.id = $1`,
    [attId],
  )
  return rows[0] || null
}

export async function insertAttachment(caseId, guildId, { file_path, original_name, mime }) {
  const { rows } = await pool.query(
    `INSERT INTO case_attachments (case_id, guild_id, file_path, original_name, mime)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [caseId, guildId, file_path, original_name, mime],
  )
  return rows[0]
}

/**
 * รายการเคส (scope-filtered) — provinces=null = admin (ทุกจังหวัด)
 */
export async function listCases(guildId, { provinces = null, status = null, limit = 100, offset = 0 } = {}) {
  const params = [guildId]
  let q = `SELECT id, ref, province, category, status, source, created_at, updated_at
           FROM cases WHERE guild_id = $1`
  if (Array.isArray(provinces)) {
    if (provinces.length === 0) return []
    params.push(provinces)
    q += ` AND province = ANY($${params.length})`
  }
  if (status) {
    params.push(status)
    q += ` AND status = $${params.length}`
  }
  params.push(limit, offset)
  q += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await pool.query(q, params)
  return rows
}

/** นับเคสแยกสถานะ (dashboard) — provinces=null = ทุกจังหวัด */
export async function countByStatus(guildId, provinces = null) {
  const params = [guildId]
  let q = `SELECT status, COUNT(*)::int AS n FROM cases WHERE guild_id = $1`
  if (Array.isArray(provinces)) {
    if (provinces.length === 0) return {}
    params.push(provinces)
    q += ` AND province = ANY($${params.length})`
  }
  q += ` GROUP BY status`
  const { rows } = await pool.query(q, params)
  return Object.fromEntries(rows.map(r => [r.status, r.n]))
}

export async function addAssignee(caseId, guildId, discordId) {
  await pool.query(
    `INSERT INTO case_assignees (case_id, guild_id, discord_id)
     VALUES ($1,$2,$3) ON CONFLICT (case_id, discord_id) DO NOTHING`,
    [caseId, guildId, discordId],
  )
}

export async function addNote(caseId, guildId, { author_discord_id = null, body, is_public = false }) {
  const { rows } = await pool.query(
    `INSERT INTO case_notes (case_id, guild_id, author_discord_id, body, is_public)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [caseId, guildId, author_discord_id, body, is_public],
  )
  return rows[0]
}

export async function updateStatus(caseId, status, closeReason = null) {
  await pool.query(
    `UPDATE cases SET status = $2, close_reason = $3, updated_at = NOW() WHERE id = $1`,
    [caseId, status, closeReason],
  )
}

export async function setAiSummary(caseId, summary, lastSyncedMessageId = null) {
  await pool.query(
    `UPDATE cases
       SET ai_summary = $2, ai_summary_updated_at = NOW(),
           last_synced_message_id = COALESCE($3, last_synced_message_id), updated_at = NOW()
     WHERE id = $1`,
    [caseId, summary, lastSyncedMessageId],
  )
}

export async function addTimelineEvents(caseId, guildId, events, source = 'ai') {
  for (const e of events) {
    await pool.query(
      `INSERT INTO case_timeline (case_id, guild_id, discord_message_id, source, body, is_public, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
       ON CONFLICT (case_id, discord_message_id) WHERE discord_message_id IS NOT NULL DO NOTHING`,
      [caseId, guildId, e.discord_message_id || null, source, e.body, e.is_public ?? false, e.occurred_at || null],
    )
  }
}

export async function getTimeline(caseId, { publicOnly = false } = {}) {
  const { rows } = await pool.query(
    `SELECT * FROM case_timeline WHERE case_id = $1${publicOnly ? ' AND is_public = TRUE' : ''}
     ORDER BY occurred_at ASC`,
    [caseId],
  )
  return rows
}

export async function toggleTimelinePublic(entryId, caseId, isPublic) {
  await pool.query(
    `UPDATE case_timeline SET is_public = $3 WHERE id = $1 AND case_id = $2`,
    [entryId, caseId, isPublic],
  )
}

export async function deleteTimelineEntry(entryId, caseId) {
  await pool.query(
    `DELETE FROM case_timeline WHERE id = $1 AND case_id = $2`,
    [entryId, caseId],
  )
}
