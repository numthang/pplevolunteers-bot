import pool from '../index.js'
import { digitsOnly } from '../../lib/thaiId.js'

/**
 * ผู้รับเงิน "คนนอก" — คนที่ไม่มี users/Discord และไม่อยู่ทะเบียนสมาชิก
 * (วิทยากรนอก คนขับรถตู้ เจ้าของสถานที่ ร้านค้าที่ออกใบกำกับภาษีไม่ได้)
 *
 * ทำไมต้องมีตารางแยก ไม่ใช่ยัด override_data ของ entry:
 *   คนกลุ่มนี้กลับมาซ้ำข้ามงาน — เก็บไว้แล้วครั้งหน้าค้นเจอ ไม่ต้องถ่ายบัตร/กรอกใหม่
 *   และไม่ต้องยืมบัญชีคนอื่นมาสวมแล้ว override ชื่อทับ (= ใบที่ลายเซ็นไม่ใช่ของเจ้าของชื่อ)
 *
 * ⚠️ ผูกกับ entry ผ่าน `docs_activity_entries.external_payee_id` ซึ่ง **XOR กับ member_user_id**
 *    (CHECK docs_entry_recipient_xor) → ทุกที่ที่เขียนผู้รับ ต้องเขียนสองคอลัมน์พร้อมกันเสมอ
 * ⚠️ id_number เก็บเป็น "ตัวเลขล้วน" เสมอ — unique index กันซ้ำจะไม่ทำงานถ้าบางแถวมีขีด
 */

const COLS = `id, org_id, payee_type, title, first_name, last_name, entity_name,
              id_number, house_no, moo, road, subdistrict, district, province,
              zip_code, phone, linked_user_id, created_by, created_at, updated_at,
              (id_card_image IS NOT NULL) AS has_id_card`

/** ชื่อที่ใช้แสดง — บุคคลใช้ชื่อ-สกุล, นิติบุคคลใช้ชื่อร้าน */
export const payeeDisplayName = (p) =>
  p?.payee_type === 'entity'
    ? (p.entity_name || '')
    : [p?.first_name, p?.last_name].filter(Boolean).join(' ')

export async function listExternalPayees(orgId) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM docs_external_payees
      WHERE org_id = $1
      ORDER BY COALESCE(entity_name, first_name), last_name, id`,
    [orgId]
  )
  return rows
}

export async function getExternalPayeeById(id, orgId) {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM docs_external_payees WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  )
  return rows[0] || null
}

/** ใช้กันสร้างซ้ำ: ถ่ายบัตรคนเดิมอีกครั้งต้องเจอแถวเดิม ไม่ใช่แถวใหม่ */
export async function findByIdNumber(orgId, idNumber) {
  const d = digitsOnly(idNumber)
  if (!d) return null
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM docs_external_payees WHERE org_id = $1 AND id_number = $2`,
    [orgId, d]
  )
  return rows[0] || null
}

/**
 * ค้นสำหรับช่องเลือกผู้รับ — คืนรูปทรงเดียวกับ /api/docs/members เพื่อให้ dropdown
 * เดิมเรนเดอร์ได้โดยไม่ต้องแยกสาขา (user_id เป็น null, external_payee_id มีค่าแทน)
 */
export async function searchExternalPayees(orgId, q, limit = 30) {
  const params = [orgId]
  let where = `org_id = $1`
  if (q) {
    params.push(`%${q}%`)
    where += ` AND (first_name ILIKE $2 OR last_name ILIKE $2 OR entity_name ILIKE $2 OR id_number ILIKE $2)`
  }
  params.push(limit)
  const { rows } = await pool.query(
    `SELECT id AS external_payee_id, NULL::int AS user_id, NULL AS discord_id, NULL AS username,
            payee_type, entity_name, first_name, last_name,
            COALESCE(NULLIF(entity_name, ''), NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), '')) AS display_name,
            province AS home_province, district AS home_amphure, subdistrict AS home_district
       FROM docs_external_payees
      WHERE ${where}
      ORDER BY display_name
      LIMIT $${params.length}`,
    params
  )
  return rows
}

const FIELDS = ['payee_type', 'title', 'first_name', 'last_name', 'entity_name', 'id_number',
                'house_no', 'moo', 'road', 'subdistrict', 'district', 'province',
                'zip_code', 'phone']

/** ช่องที่ผู้ใช้ไม่ได้กรอกมาเป็น '' จากฟอร์ม — ต้องลงเป็น NULL
 *  ไม่งั้น COALESCE ที่ view/ค้นหาจะเลือก '' มาใช้แล้วชื่อผู้รับกลายเป็นช่องว่าง */
const clean = (f, v) => {
  if (f === 'id_number')  return digitsOnly(v) || null
  if (f === 'payee_type') return v || 'person'
  const t = typeof v === 'string' ? v.trim() : v
  return t === '' || t === undefined ? null : t
}

export async function createExternalPayee(orgId, createdBy, data) {
  const vals = FIELDS.map(f => clean(f, data[f]))
  const { rows } = await pool.query(
    `INSERT INTO docs_external_payees (org_id, created_by, ${FIELDS.join(', ')})
     VALUES ($1, $2, ${FIELDS.map((_, i) => `$${i + 3}`).join(', ')})
     RETURNING ${COLS}`,
    [orgId, createdBy, ...vals]
  )
  return rows[0]
}

/** แก้เฉพาะฟิลด์ที่ส่งมา (undefined = ไม่แตะ) — หน้า settings แก้ทีละช่องได้ */
export async function updateExternalPayee(id, orgId, data) {
  const sets = []
  const vals = [id, orgId]
  for (const f of FIELDS) {
    if (data[f] === undefined) continue
    vals.push(clean(f, data[f]))
    sets.push(`${f} = $${vals.length}`)
  }
  if (!sets.length) return getExternalPayeeById(id, orgId)
  const { rows } = await pool.query(
    `UPDATE docs_external_payees SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $1 AND org_id = $2 RETURNING ${COLS}`,
    vals
  )
  return rows[0] || null
}

/**
 * ลบได้เฉพาะที่ยังไม่ถูกใช้ — ใบสำคัญรับเงินที่ออกไปแล้วต้องสืบกลับได้เสมอ
 * @returns {'ok'|'not_found'|'in_use'}
 */
export async function deleteExternalPayee(id, orgId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM docs_activity_entries WHERE external_payee_id = $1`,
    [id]
  )
  if (rows[0].n > 0) return 'in_use'
  const { rowCount } = await pool.query(
    `DELETE FROM docs_external_payees WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  )
  return rowCount > 0 ? 'ok' : 'not_found'
}

/** สำเนาบัตรของคนนอก — เก็บในแถวของเขาเอง ไม่ใช่ users.id_card_image (เขาไม่มี users row) */
export async function saveExternalIdCard(id, orgId, imageBuffer) {
  const { rowCount } = await pool.query(
    `UPDATE docs_external_payees SET id_card_image = $3, updated_at = now()
      WHERE id = $1 AND org_id = $2`,
    [id, orgId, imageBuffer]
  )
  return rowCount > 0
}

export async function getExternalIdCard(id, orgId) {
  const { rows } = await pool.query(
    `SELECT id_card_image FROM docs_external_payees WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  )
  return rows[0]?.id_card_image ?? null
}
