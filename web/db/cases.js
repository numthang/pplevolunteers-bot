/**
 * Case (เรื่องร้องเรียน) — web-side DB layer (ESM)
 *
 * ⚠️ กันหลุด PII ระดับโครงสร้าง: แยก query 2 ตัว
 *    - getCaseByRefPublic  → เฉพาะ field ปลอดภัย (status + public notes) สำหรับหน้า public
 *    - getCaseByRefFull    → ทุก field (PII) เรียก "หลังผ่าน gate canManageCases + scope" เท่านั้น
 *
 * ทุก query filter ด้วย org_id (ยกเว้น case_config ที่ยัง guild_id) · province scope filter ที่ list/full
 * ref format เดียวกับ db/case.js (bot): <รหัสมหาดไทย>-<พ.ศ.2หลัก>-<random4hex>
 */

import { randomBytes } from 'crypto'
import pool from './index.js'
import { provinceToCode } from '../lib/provinceCode.js'
import { mirrorEntityCard, deleteCardForEntity } from './kanban/links.js'

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
export async function createCase(orgId, data) {
  const {
    province, category = null, title = null, detail = null, source = 'web',
    complainant_name, complainant_phone, complainant_line_id = null,
    consent_at = null, intake_ip = null, created_by = null,
    discord_guild_id = null,
  } = data
  const ref = await generateRef(province)
  const { rows } = await pool.query(
    `INSERT INTO cases
       (org_id, ref, province, category, title, detail, source, status,
        complainant_name, complainant_phone, complainant_line_id,
        consent_at, intake_ip, created_by, discord_guild_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [orgId, ref, province, category, title, detail, source,
     complainant_name, complainant_phone, complainant_line_id,
     consent_at, intake_ip, created_by, discord_guild_id],
  )

  // ⭐ ทุกเคสต้องมีการ์ดใน kanban (user เคาะ 2026-08-24: *ต้องมี ทุกใบ*)
  //    fire-and-forget แบบเดียวกับ auditLog — ถ้า kanban พังต้องไม่ทำให้รับเรื่องร้องเรียนไม่ได้
  //    ตาข่ายอีกชั้นคือ reconcileEntityCards() ที่กวาดของที่ hook พลาดตามทีหลัง
  mirrorEntityCard(orgId, 'case', {
    id: rows[0].id,
    title: rows[0].title || `เรื่องร้องเรียน ${rows[0].ref}`,
  }, created_by).catch(() => {})

  return rows[0]
}

/**
 * field ที่ caseworker แก้ย้อนหลังได้ — **whitelist ห้ามเปิดกว้าง**
 *
 * ⚠️ `province` ไม่อยู่ในนี้โดยตั้งใจ: รหัสจังหวัดถูกฝังใน `ref` ตั้งแต่ generateRef()
 *    และ ref ตัวนั้นส่ง SMS ออกไปแล้ว + เป็น URL หน้า public + เป็นชื่อ Discord thread
 *    → เปลี่ยนจังหวัด = ref โกหกถาวร (regenerate ไม่ได้ ลิงก์สาธารณะจะพัง)
 *    นอกจากนี้ gateCase() เช็ค scope จาก province **เดิม** เท่านั้น → ปล่อยให้แก้
 *    = คนจังหวัด A ผลักเคสเข้าจังหวัด B ได้แล้วตัวเองหลุด scope ทันที
 *    → ย้ายจังหวัดจึงเป็น action แยก `transferCaseProvince()` ที่เช็ค scope ทั้งสองฝั่ง
 */
export const EDITABLE_CASE_FIELDS = [
  'title', 'detail', 'category',
  'complainant_name', 'complainant_phone', 'complainant_line_id',
]

/**
 * ย้ายจังหวัดของเคส — **ref ไม่เปลี่ยนตาม** (ตั้งใจ)
 *
 * ref เดิมถูกส่ง SMS ไปหาผู้ร้องแล้ว + เป็น URL หน้าติดตามสาธารณะ → regenerate ไม่ได้
 * ผลคือรหัสจังหวัดที่นำหน้า ref จะค้างเป็นของจังหวัดเดิมตลอดไป ยอมแลกเพราะ
 * `province` เป็นตัวคุมทั้งสิทธิ์การมองเห็น (canAccessCaseProvince) และ config หัวหนังสือ
 * ปล่อยให้ผิดคือเคสหายจากสายตาทีมพื้นที่ + ออกหนังสือไม่ได้เลย (เจอจริง 2026-09-01)
 *
 * ⚠️ scope ทั้งต้นทางและปลายทางต้องเช็คที่ชั้น API ก่อนเรียกฟังก์ชันนี้
 */
export async function transferCaseProvince(orgId, caseId, province) {
  const { rows } = await pool.query(
    `UPDATE cases SET province = $3, updated_at = NOW()
     WHERE id = $1 AND org_id = $2
     RETURNING *`,
    [caseId, orgId, province],
  )
  return rows[0] || null
}

/**
 * แก้ข้อมูลเคส — อัปเดตเฉพาะ field ที่อยู่ใน whitelist และถูกส่งมาจริง
 * @returns {object|null} แถวหลังอัปเดต · null ถ้าไม่มี field ที่แก้ได้ หรือ org ไม่ตรง
 */
export async function updateCaseFields(orgId, caseId, fields) {
  const keys = Object.keys(fields).filter(k => EDITABLE_CASE_FIELDS.includes(k))
  if (!keys.length) return null
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ')
  const { rows } = await pool.query(
    `UPDATE cases SET ${sets}, updated_at = NOW()
     WHERE id = $1 AND org_id = $2
     RETURNING *`,
    [caseId, orgId, ...keys.map(k => fields[k])],
  )
  return rows[0] || null
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
  return rows[0] || null
}

/**
 * 🔒 FULL — ทุก field รวม PII · เรียกหลังผ่าน gate (canManageCases + scope) เท่านั้น
 * @param {number} orgId  org-scope
 */
export async function getCaseByRefFull(orgId, ref) {
  const { rows } = await pool.query(
    `SELECT * FROM cases WHERE org_id = $1 AND ref = $2`,
    [orgId, ref],
  )
  return rows[0] || null
}


/**
 * เคสจาก id ตรงๆ — ใช้ตอนเข้ามาจากฝั่ง kanban (`kanban_card_links.entity_id` เก็บ id ไม่ใช่ ref)
 * ⚠️ คืนทุก field (PII) เหมือน getCaseByRefFull → เรียกได้หลังผ่านด่านสิทธิ์แล้วเท่านั้น
 */
export async function getCaseById(orgId, id) {
  const { rows } = await pool.query(
    `SELECT * FROM cases WHERE org_id = $1 AND id = $2`,
    [orgId, id],
  )
  return rows[0] || null
}

export async function getAssignees(caseId) {
  const { rows } = await pool.query(
    `SELECT a.user_id, u.discord_id, a.assigned_at
     FROM case_assignees a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.case_id = $1
     ORDER BY a.assigned_at`,
    [caseId],
  )
  return rows
}

/**
 * assignees พร้อมชื่อ (JOIN org_members) — สำหรับแสดงในหน้า workspace
 * @param {number} orgId  org-scope — หาชื่อ/discord_id ของผู้รับผิดชอบ
 */
export async function getAssigneesWithNames(caseId, orgId) {
  const { rows } = await pool.query(
    `SELECT a.user_id, a.assigned_at, u.discord_id,
            COALESCE(om.display_name, u.username, u.discord_id, a.user_id::text) AS name
     FROM case_assignees a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN LATERAL (
       SELECT display_name FROM org_members om2
       WHERE om2.user_id = a.user_id AND om2.org_id = $2 AND om2.display_name IS NOT NULL
       LIMIT 1
     ) om ON true
     WHERE a.case_id = $1
     ORDER BY a.assigned_at`,
    [caseId, orgId],
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

export async function getAttachmentById(orgId, attId) {
  const { rows } = await pool.query(
    `SELECT a.*, c.ref, c.province, c.org_id AS case_org_id
     FROM case_attachments a JOIN cases c ON c.id = a.case_id
     WHERE a.id = $1 AND c.org_id = $2`,
    [attId, orgId],
  )
  return rows[0] || null
}

/**
 * @param {object} meta  { file_path, original_name, mime, discord_attachment_id?, discord_message_id? }
 *   ใส่ discord_attachment_id เมื่อไฟล์มาจากเธรด Discord → unique index กัน sync ซ้ำ
 *   (ON CONFLICT DO NOTHING → คืน undefined ถ้าไฟล์นี้เคยนำเข้าแล้ว)
 */
export async function insertAttachment(caseId, orgId, {
  file_path, original_name, mime,
  discord_attachment_id = null, discord_message_id = null,
}) {
  const { rows } = await pool.query(
    `INSERT INTO case_attachments
       (case_id, org_id, file_path, original_name, mime, discord_attachment_id, discord_message_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (discord_attachment_id) WHERE discord_attachment_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [caseId, orgId, file_path, original_name, mime, discord_attachment_id, discord_message_id],
  )
  return rows[0]
}

/**
 * เลื่อน watermark ของการนำเข้าไฟล์แนบ — **เส้นที่ 2 แยกจาก advanceSyncWatermark**
 *
 * เริ่มจาก NULL โดยตั้งใจ: รอบแรกกวาดตั้งแต่ข้อความแรกสุดของเธรด → ได้รูปเก่าที่เส้น
 * timeline เลยไปแล้วกลับคืนมาทั้งหมด (backfill ฟรี ไม่ต้องเขียน script แยก)
 */
export async function advanceAttachmentWatermark(caseId, expectedId, newId, client = pool) {
  const { rowCount } = await client.query(
    `UPDATE cases SET last_attachment_message_id = $3
     WHERE id = $1 AND last_attachment_message_id IS NOT DISTINCT FROM $2`,
    [caseId, expectedId, newId],
  )
  return rowCount > 0
}

/**
 * "ยังไม่ปิด" — ชุดสถานะที่ยังต้องมีคนทำอะไรกับเคส
 * ⛔ resolved/closed/rejected ไม่อยู่ในนี้ · แก้ตรงนี้ที่เดียวแล้วทั้งหน้าแรกและ /case ตามกันเอง
 */
export const ACTIVE_STATUSES = ['open', 'in_progress']
export const DONE_STATUSES = ['resolved', 'closed']   // ⛔ rejected (ตีกลับ) ไม่นับเป็น "เสร็จ"
export const ACTIVE = 'active'   // ค่าพิเศษของ ?status= ใน URL → open + in_progress
export const DONE = 'done'       // ค่าพิเศษของ ?status= ใน URL → resolved + closed
const setSql = (arr) => `'{${arr.join(',')}}'`

/**
 * รายการเคส (scope-filtered) — provinces=null = admin (ทุกจังหวัด)
 * @param {number} orgId  org-scope
 */
export async function listCases(orgId, { provinces = null, status = null, assigned = null, mineUserId = null, limit = 100, offset = 0 } = {}) {
  const params = [orgId]
  // ⛔ เคสในกรุไม่อยู่ในรายการทำงาน — ดูได้ทางเดียวคือเปิด URL ตรงๆ (getCaseByRefFull ไม่กรอง)
  let q = `SELECT id, ref, province, category, title, status, source, created_at, updated_at
           FROM cases c WHERE org_id = $1 AND archived_at IS NULL`
  if (Array.isArray(provinces)) {
    if (provinces.length === 0) return []
    params.push(provinces)
    q += ` AND province = ANY($${params.length})`
  }
  if (status === ACTIVE)     q += ` AND status = ANY(${setSql(ACTIVE_STATUSES)})`
  else if (status === DONE)  q += ` AND status = ANY(${setSql(DONE_STATUSES)})`
  else if (status) {
    params.push(status)
    q += ` AND status = $${params.length}`
  }
  // ⭐ assigned: 'none' = ยังไม่มีเจ้าภาพ · 'me' = ฉันรับผิดชอบ · 'any' = มีคนรับแล้ว
  //    ตรงกับ 3 บรรทัดบนการ์ดหน้าแรก (countCaseStats ข้างล่าง) — แก้ที่ไหนต้องแก้คู่กันเสมอ
  if (assigned === 'me' && mineUserId) {
    params.push(mineUserId)
    q += ` AND EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id AND a.user_id = $${params.length})`
  } else if (assigned === 'any') {
    q += ` AND EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id)`
  } else if (assigned === 'none') {
    q += ` AND NOT EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id)`
  }
  params.push(limit, offset)
  q += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`
  const { rows } = await pool.query(q, params)
  return rows
}

/** นับเคสแยกสถานะ (dashboard) — provinces=null = ทุกจังหวัด · orgId = org-scope */
export async function countByStatus(orgId, provinces = null) {
  const params = [orgId]
  let q = `SELECT status, COUNT(*)::int AS n FROM cases WHERE org_id = $1 AND archived_at IS NULL`
  if (Array.isArray(provinces)) {
    if (provinces.length === 0) return {}
    params.push(provinces)
    q += ` AND province = ANY($${params.length})`
  }
  q += ` GROUP BY status`
  const { rows } = await pool.query(q, params)
  return Object.fromEntries(rows.map(r => [r.status, r.n]))
}

/**
 * ตัวเลข 3 บรรทัดบนการ์ด "เรื่องร้องเรียน" หน้าแรก (user เคาะ 2026-08-31)
 *   รอทำ     = เคสที่ยังไม่มีใครรับ
 *   กำลังทำ  = {ฉันรับผิดชอบ}/{มีคนรับแล้วทั้งหมด}
 *   เสร็จสิ้น = resolved + closed ใน 30 วันล่าสุด
 *
 * ⭐ แบ่งกองด้วย "มีคนรับหรือยัง" เหมือนการ์ดการบ้าน — ไม่ผูกกับชื่อสถานะ
 *    ⚠️ เคสไม่มีเจ้าภาพ/ผู้ช่วยแยกกันแบบ kanban · case_assignees เป็นรายชื่อแบนๆ
 *       "มีชื่อในรายการ = รับผิดชอบ" จบ
 * ⚠️ ทุกเลขใช้ provinces ชุดเดียวกันเสมอ — "กำลังทำ" เป็น subset ของ "มีคนรับแล้ว" ต้องไม่มีทางมากกว่า
 * ⛔ rejected (ตีกลับ) ไม่นับทั้ง active และ done — หายจากทั้ง 3 บรรทัดโดยตั้งใจ
 *    ดูของทั้งหมดได้ที่ /case/manage ชิป "ทั้งหมด"
 */
export async function countCaseStats(orgId, userId, provinces = null) {
  const ASSIGNED = `EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id)`
  const MINE = `EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id AND a.user_id = $2)`
  const ACTIVE_SQL = `c.status = ANY(${setSql(ACTIVE_STATUSES)})`

  const params = [orgId, userId || null]
  let q = `SELECT COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND NOT ${ASSIGNED})::int          AS unassigned,
                  COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND ${MINE})::int                  AS mine,
                  COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND ${ASSIGNED})::int              AS assigned,
                  COUNT(*) FILTER (WHERE c.status = ANY(${setSql(DONE_STATUSES)})
                                     AND c.updated_at >= now() - interval '30 days')::int AS done
             FROM cases c
            WHERE c.org_id = $1`
  if (Array.isArray(provinces)) {
    if (provinces.length === 0) return { unassigned: 0, mine: 0, assigned: 0, done: 0 }
    params.push(provinces)
    q += ` AND c.province = ANY($${params.length})`
  }
  const { rows } = await pool.query(q, params)
  const r = rows[0] || {}
  return { unassigned: r.unassigned || 0, mine: r.mine || 0, assigned: r.assigned || 0, done: r.done || 0 }
}

/**
 * ตัวเลขในวงเล็บของ dropdown ตัวกรองที่ /case (user เคาะ 2026-08-31)
 * ⚠️ ทุกเลขต้องตรงกับ listCases ที่ตัวเลือกนั้นยิงเป๊ะ — เลือกแล้วต้องเจอจำนวนเท่าที่เขียนไว้
 *    total=ไม่กรองอะไร · unassigned/mine/assigned=ACTIVE+เจ้าภาพ · done=DONE_STATUSES ทั้งหมด (ไม่ตัด 30 วันแบบ countCaseStats)
 */
export async function countByFilter(orgId, userId, provinces = null) {
  const ASSIGNED = `EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id)`
  const MINE = `EXISTS (SELECT 1 FROM case_assignees a WHERE a.case_id = c.id AND a.user_id = $2)`
  const ACTIVE_SQL = `c.status = ANY(${setSql(ACTIVE_STATUSES)})`

  const params = [orgId, userId || null]
  let q = `SELECT COUNT(*)::int                                                       AS total,
                  COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND NOT ${ASSIGNED})::int      AS unassigned,
                  COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND ${MINE})::int              AS mine,
                  COUNT(*) FILTER (WHERE ${ACTIVE_SQL} AND ${ASSIGNED})::int          AS assigned,
                  COUNT(*) FILTER (WHERE c.status = ANY(${setSql(DONE_STATUSES)}))::int AS done
             FROM cases c
            WHERE c.org_id = $1 AND c.archived_at IS NULL`
  if (Array.isArray(provinces)) {
    if (provinces.length === 0) return { total: 0, unassigned: 0, mine: 0, assigned: 0, done: 0 }
    params.push(provinces)
    q += ` AND c.province = ANY($${params.length})`
  }
  const { rows } = await pool.query(q, params)
  const r = rows[0] || {}
  return { total: r.total || 0, unassigned: r.unassigned || 0, mine: r.mine || 0, assigned: r.assigned || 0, done: r.done || 0 }
}

/**
 * ⛔ **ห้ามเรียกตรงๆ จาก route** — ใช้ `lib/caseAssign.js` แทน
 *    เจ้าภาพเคยดริฟต์เพราะเขียนตารางนี้อย่างเดียวแล้วไม่แตะการ์ด kanban
 *    (`kanban_cards.owner_user_id` เป็น **สำเนา** ไม่ได้อ่านสดเหมือนสถานะ)
 *    service ตัวนั้นเรียก `syncCaseCardPeople()` + ping Discord + audit ให้ครบในจังหวะเดียว
 */
export async function addAssignee(caseId, orgId, userId) {
  await pool.query(
    `INSERT INTO case_assignees (case_id, org_id, user_id)
     VALUES ($1,$2,$3) ON CONFLICT (case_id, user_id) DO NOTHING`,
    [caseId, orgId, userId],
  )
}

/** ⛔ ห้ามเรียกตรงๆ จาก route — ใช้ `lib/caseAssign.js` (เหตุผลเดียวกับ addAssignee) */
export async function removeAssignee(caseId, userId) {
  await pool.query(
    `DELETE FROM case_assignees WHERE case_id = $1 AND user_id = $2`,
    [caseId, userId],
  )
}

/**
 * เก็บเข้ากรุ / เอาออกจากกรุ — **ย้อนได้เสมอ** ข้อมูลอยู่ครบ
 *
 * "กรุ" = เอาออกจากสายตาคนทำงาน (รายการ /case · ตัวนับหน้าแรก · บอร์ด kanban)
 * ⛔ ไม่ใช่การปิดเคส และ **ไม่กระทบหน้าติดตามสาธารณะ** `/complaint/[ref]` (user เคาะ 2026-08-31)
 *    ผู้ร้องยังเห็นสถานะ+โน้ตสาธารณะเหมือนเดิม — เข้ากรุคือการจัดบ้านภายใน ไม่ใช่คำตอบต่อผู้ร้อง
 * การ์ด kanban หายจากบอร์ดเองผ่าน visibleLinkSql (statusSql.js) ไม่ต้องแตะการ์ด
 */
export async function archiveCase(orgId, caseId, archived = true) {
  const { rows } = await pool.query(
    `UPDATE cases SET archived_at = $3, updated_at = NOW()
      WHERE org_id = $1 AND id = $2 RETURNING id`,
    [orgId, caseId, archived ? new Date() : null],
  )
  return Boolean(rows[0])
}

/**
 * ลบถาวร — ⛔ ย้อนไม่ได้ · ด่านคือ isAdmin() ที่ route
 *
 * ⚠️ ต้องลบการ์ด kanban ก่อน — `kanban_card_links` ทำ FK มาหา `cases` ไม่ได้ (entity ชี้ได้ 2 ตาราง)
 *    ปล่อยไว้ = การ์ดกำพร้าที่อ่านชื่อ/สถานะสดไม่เจอต้นทาง (เหมือน deletePost)
 * ⚠️ ไฟล์แนบต้อง unlink เอง — `uploads/cases/` **ไม่มี gc** (scripts/posts/gc-media.js กวาดแค่ storage/posts)
 *    ไฟล์เคสเป็น 1:1 ต่อแถว ไม่มี snapshot อ้างซ้ำแบบโพสต์ → ลบตรงนี้ได้เลย
 *    คนกดลบถาวรเพราะอยากให้ PII หายจริง ไม่ใช่หายจากตาราง
 * ตารางลูกหายตาม CASCADE ครบ 3: case_timeline · case_assignees · case_attachments
 *
 * @returns {Promise<{ok:boolean, files:string[]}>} files = file_path ที่ต้องลบออกจากดิสก์ (route เป็นคนลบ)
 */
export async function deleteCase(orgId, caseId) {
  const { rows: files } = await pool.query(
    `SELECT a.file_path FROM case_attachments a
      JOIN cases c ON c.id = a.case_id
     WHERE a.case_id = $1 AND c.org_id = $2`,
    [caseId, orgId],
  )
  await deleteCardForEntity('case', caseId).catch(() => {})
  const { rows } = await pool.query(
    `DELETE FROM cases WHERE org_id = $1 AND id = $2 RETURNING id`,
    [orgId, caseId],
  )
  return { ok: Boolean(rows[0]), files: files.map(f => f.file_path).filter(Boolean) }
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

/**
 * @param {object} [client]  pg client ถ้าต้องอยู่ใน transaction เดียวกับ advanceSyncWatermark
 *   (sync จาก Discord ต้อง insert + เลื่อน watermark ให้ atomic — ดู advanceSyncWatermark)
 */
/**
 * เลื่อน watermark ของ Discord sync แบบมีเงื่อนไข (optimistic lock)
 *
 * `last_synced_message_id` = ที่คั่นว่า sync ข้อความมาถึงไหนแล้ว · ครั้งถัดไปดึงเฉพาะที่ใหม่กว่า
 * ⚠️ เลื่อนได้ต่อเมื่อค่าใน DB ยังเท่ากับตอนที่อ่านมา (`expectedId`) — กัน 2 คนกด refresh
 *    พร้อมกันแล้ว insert timeline ซ้ำ · คนที่แพ้จะได้ rowCount 0 → ต้อง ROLLBACK
 * ⚠️ ห้ามแตะ `updated_at` — หน้า public โชว์ค่านั้น sync เฉยๆ ไม่ควรทำให้ผู้ร้องเรียนเห็นว่ามีอัปเดต
 *
 * @returns {boolean} true = เลื่อนสำเร็จ · false = มีคนอื่น sync แซงไปแล้ว
 */
export async function advanceSyncWatermark(caseId, expectedId, newId, client = pool) {
  const { rowCount } = await client.query(
    `UPDATE cases SET last_synced_message_id = $3
     WHERE id = $1 AND last_synced_message_id IS NOT DISTINCT FROM $2`,
    [caseId, expectedId, newId],
  )
  return rowCount > 0
}

/**
 * @param {object} [client]  pg client ถ้าต้องอยู่ใน transaction เดียวกับ advanceSyncWatermark
 *   (sync จาก Discord ต้อง insert + เลื่อน watermark ให้ atomic — ดู advanceSyncWatermark)
 */
export async function addTimelineEvents(caseId, orgId, events, source = 'ai', client = pool) {
  for (const e of events) {
    await client.query(
      `INSERT INTO case_timeline (case_id, org_id, discord_message_id, source, body, is_public, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
       ON CONFLICT (case_id, discord_message_id) WHERE discord_message_id IS NOT NULL DO NOTHING`,
      [caseId, orgId, e.discord_message_id || null, source, e.body, e.is_public ?? false, e.occurred_at || null],
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

export async function getTimelineEntry(entryId, caseId) {
  const { rows } = await pool.query(
    `SELECT id, source, body, is_public, occurred_at FROM case_timeline WHERE id = $1 AND case_id = $2`,
    [entryId, caseId],
  )
  return rows[0] || null
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

export async function getLetterDrafts(caseId) {
  const { rows } = await pool.query(`SELECT letters FROM cases WHERE id = $1`, [caseId])
  return rows[0]?.letters || []
}

export async function saveLetterDraft(caseId, fields) {
  const { randomUUID } = await import('crypto')
  const draft = { id: randomUUID(), ...fields, saved_at: new Date().toISOString() }
  await pool.query(
    `UPDATE cases SET letters = COALESCE(letters, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
    [caseId, JSON.stringify([draft])],
  )
  return draft
}

export async function updateLetterDraft(caseId, draftId, fields) {
  const { rows } = await pool.query(`SELECT letters FROM cases WHERE id = $1`, [caseId])
  const letters = rows[0]?.letters || []
  const idx = letters.findIndex(l => l.id === draftId)
  if (idx === -1) return null
  letters[idx] = { ...letters[idx], ...fields, saved_at: new Date().toISOString() }
  await pool.query(`UPDATE cases SET letters = $2 WHERE id = $1`, [caseId, JSON.stringify(letters)])
  return letters[idx]
}

export async function deleteLetterDraft(caseId, draftId) {
  const { rows } = await pool.query(`SELECT letters FROM cases WHERE id = $1`, [caseId])
  const letters = (rows[0]?.letters || []).filter(l => l.id !== draftId)
  await pool.query(`UPDATE cases SET letters = $2 WHERE id = $1`, [caseId, JSON.stringify(letters)])
}
