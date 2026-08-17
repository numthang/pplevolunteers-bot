// web/db/kanban/labels.js — ป้ายของการบ้าน (มี "กลุ่ม" กำกับ)
//
// ป้ายกลไกเดียวครอบ 3 อย่างที่ AppFlowy แยกเป็น 3 field: สายงาน · พื้นที่ · อุปกรณ์
// (md/kanban/CUSTOM-FIELDS.md — เลือกได้หลายค่าจากรายการ = เรื่องเดียวกันเป๊ะ)
//
// ⛔ ห้ามมีชื่อกลุ่มใดๆ hardcode ในโค้ด — 'พื้นที่'/'สายงาน' เป็นข้อมูลที่ org ตั้งเอง
//    org กรุงเทพอาจตั้งกลุ่ม "เขต" · ทีมชาติตั้ง "ภาค" · โค้ดต้องไม่รู้จักชื่อพวกนี้เลย
import pool from '../index.js'
import { autoColor } from '../../lib/kanbanLabelColors.js'

/** ป้ายทั้งหมดของ org (ที่ยังไม่ถูกซ่อน) เรียงตามกลุ่ม */
export async function listLabels(orgId, { includeArchived = false } = {}) {
  const { rows } = await pool.query(
    `SELECT id, group_name, name, color, sort_order, archived_at
       FROM kanban_labels
      WHERE org_id = $1 ${includeArchived ? '' : 'AND archived_at IS NULL'}
      ORDER BY (group_name IS NULL), group_name, sort_order, name`,
    [orgId]
  )
  return rows
}

/** ป้ายจัดเป็นกลุ่มให้ UI วาดเป็นหมวดๆ — [{ group, labels: [...] }] */
export async function listLabelGroups(orgId) {
  const labels = await listLabels(orgId)
  const byGroup = new Map()
  for (const l of labels) {
    const key = l.group_name || ''
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(l)
  }
  return [...byGroup.entries()].map(([group, list]) => ({ group: group || null, labels: list }))
}

/** ชื่อกลุ่มที่ org นี้มีอยู่จริง (ไม่นับป้ายที่ซ่อน) — ใช้กันคนตั้งกลุ่มใหม่มั่วตอนพิมพ์ป้ายในกล่อง */
export async function listGroupNames(orgId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT group_name FROM kanban_labels
      WHERE org_id = $1 AND group_name IS NOT NULL AND archived_at IS NULL
      ORDER BY group_name`,
    [orgId]
  )
  return rows.map(r => r.group_name)
}

/**
 * หาป้ายเดิม หรือสร้างใหม่ถ้ายังไม่มี — ใช้ตอน import และตอนคนพิมพ์ป้ายใหม่ในกล่อง
 * ⚠️ unique index ใช้ COALESCE(group_name, '') → ON CONFLICT ปกติจับไม่ได้ ต้อง SELECT ก่อน
 * ⚠️ SELECT-แล้ว-INSERT = TOCTOU · 2 คนพิมพ์ป้ายชื่อเดียวกันพร้อมกัน คนหลังชน 23505
 *    → จับแล้ว SELECT ซ้ำ คืนของที่อีกคนเพิ่งสร้าง (ปลายทางเหมือนกันเป๊ะ ไม่ต้องให้ผู้ใช้เห็น error)
 */
export async function ensureLabel(orgId, { name, groupName = null, color = null }) {
  const clean = String(name || '').trim()
  if (!clean) return null

  const find = async () => {
    const { rows } = await pool.query(
      `SELECT id, group_name, name, color FROM kanban_labels
        WHERE org_id = $1 AND COALESCE(group_name, '') = COALESCE($2, '') AND name = $3`,
      [orgId, groupName, clean]
    )
    return rows[0] || null
  }

  const found = await find()
  if (found) return found

  try {
    const { rows } = await pool.query(
      `INSERT INTO kanban_labels (org_id, group_name, name, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, group_name, name, color`,
      [orgId, groupName, clean, color]
    )
    return rows[0]
  } catch (e) {
    if (e.code === '23505') return await find()   // อีกคนสร้างไปแล้วระหว่างทาง
    throw e
  }
}

/** ติดป้ายชุดใหม่ให้การ์ด (แทนที่ของเดิมทั้งชุด) — labelIds ว่าง = ถอดหมด */
export async function setCardLabels(orgId, cardId, labelIds) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // ยืนยันว่าการ์ดอยู่ org นี้จริง — กันเขียนข้าม tenant ด้วย id ที่เดาเอา
    const { rows: card } = await client.query(
      `SELECT id FROM kanban_cards WHERE org_id = $1 AND id = $2`, [orgId, cardId]
    )
    if (!card[0]) { await client.query('ROLLBACK'); return false }

    // ⚠️ ลบเฉพาะป้ายที่ "ยังไม่ถูกซ่อน" — ป้ายที่ซ่อนแล้วไม่โผล่ในกล่องเลือก
    //    ถ้าลบทั้งชุด: admin ซ่อนป้าย → ชิปหายจากการ์ด → ใครไปแตะป้ายบนการ์ดใบนั้นต่อ
    //    = ความสัมพันธ์เดิมหายถาวร เลิกซ่อนแล้วไม่กลับมา (ข้อมูลหายเงียบจากการกระทำที่ไม่เกี่ยวกัน)
    await client.query(
      `DELETE FROM kanban_card_labels cl
        USING kanban_labels l
        WHERE cl.label_id = l.id AND cl.card_id = $1 AND l.archived_at IS NULL`,
      [cardId]
    )
    if (labelIds?.length) {
      // กรองด้วย org_id อีกชั้น — ป้ายของ org อื่นติดการ์ดเราไม่ได้
      await client.query(
        `INSERT INTO kanban_card_labels (card_id, label_id)
         SELECT $1, l.id FROM kanban_labels l
          WHERE l.org_id = $2 AND l.id = ANY($3::bigint[])
         ON CONFLICT DO NOTHING`,
        [cardId, orgId, labelIds]
      )
    }
    await client.query('COMMIT')
    return true
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// ── หน้าจัดการป้าย (admin) ──────────────────────────────────────────

/**
 * ป้ายทั้งหมด (รวมที่ซ่อนไว้) + จำนวนการ์ดที่ติดอยู่ — query เดียว ไม่ยิงต่อป้าย
 * ⚠️ ไม่นับการ์ดที่ถูกลบไปแล้ว (archived_at) — เลขนี้คือเลขที่ admin ใช้ตัดสินว่าซ่อนป้ายนี้ปลอดภัยไหม
 */
export async function listLabelsWithCounts(orgId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.group_name, l.name, l.color, l.sort_order, l.archived_at,
            COUNT(c.id)::int AS card_count
       FROM kanban_labels l
       LEFT JOIN kanban_card_labels cl ON cl.label_id = l.id
       LEFT JOIN kanban_cards c ON c.id = cl.card_id AND c.archived_at IS NULL
      WHERE l.org_id = $1
      GROUP BY l.id
      ORDER BY (l.archived_at IS NOT NULL), (l.group_name IS NULL), l.group_name, l.sort_order, l.name`,
    [orgId]
  )
  return rows
}

/**
 * แก้ป้าย 1 ใบ — ชื่อ / กลุ่ม / สี
 *
 * ⭐ **แช่สีก่อนแก้ชื่อเสมอ** — สีอัตโนมัติ hash มาจาก `กลุ่ม/ชื่อ` (lib/kanbanLabelColors.js)
 *    ป้ายที่ color เป็น NULL (ของจริงตอนนี้ NULL ทั้ง 29 อัน) พอเปลี่ยนชื่อหรือย้ายกลุ่ม
 *    = สีเด้งบนทุกการ์ดที่ติดป้ายนั้นพร้อมกัน · แช่ค่าเดิมลง DB ก่อน แล้วสีจะนิ่งตลอดไป
 *
 * @returns {{ok:true, label}|{ok:false, notFound:true}|{ok:false, duplicate:true}}
 */
export async function updateLabel(orgId, labelId, { name, groupName, color } = {}) {
  const { rows: cur } = await pool.query(
    `SELECT id, group_name, name, color FROM kanban_labels WHERE org_id = $1 AND id = $2`,
    [orgId, labelId]
  )
  if (!cur[0]) return { ok: false, notFound: true }

  const nextName  = name      === undefined ? cur[0].name       : String(name).trim()
  const nextGroup = groupName === undefined ? cur[0].group_name : (String(groupName || '').trim() || null)
  const renamed   = nextName !== cur[0].name || nextGroup !== cur[0].group_name

  let nextColor = color === undefined ? cur[0].color : (color || null)
  if (!nextColor && renamed) nextColor = autoColor(cur[0])   // แช่สีเดิมไว้ก่อนชื่อเปลี่ยน

  try {
    const { rows } = await pool.query(
      `UPDATE kanban_labels SET name = $3, group_name = $4, color = $5
        WHERE org_id = $1 AND id = $2
        RETURNING id, group_name, name, color, sort_order, archived_at`,
      [orgId, labelId, nextName, nextGroup, nextColor]
    )
    return { ok: true, label: rows[0] }
  } catch (e) {
    // 23505 = ชนกับป้ายชื่อเดียวกันในกลุ่มเดียวกัน (uq_kanban_labels_name)
    if (e.code === '23505') return { ok: false, duplicate: true }
    throw e
  }
}

/** ซ่อนป้าย (ไม่ลบ) — การ์ดที่ติดอยู่ยังเก็บความสัมพันธ์ไว้ (setCardLabels กันไม่ให้หลุดแล้ว) */
export async function archiveLabel(orgId, labelId) {
  const { rows } = await pool.query(
    `UPDATE kanban_labels SET archived_at = now()
      WHERE org_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`,
    [orgId, labelId]
  )
  return Boolean(rows[0])
}

/** เลิกซ่อน — ป้ายกลับมาโผล่บนการ์ดที่เคยติดไว้เหมือนเดิม */
export async function unarchiveLabel(orgId, labelId) {
  const { rows } = await pool.query(
    `UPDATE kanban_labels SET archived_at = NULL
      WHERE org_id = $1 AND id = $2 AND archived_at IS NOT NULL RETURNING id`,
    [orgId, labelId]
  )
  return Boolean(rows[0])
}

/** จำนวนการ์ดที่ติดป้ายนี้ — ให้ UI เตือนก่อนซ่อน/ลบ · ไม่นับการ์ดที่ถูกลบไปแล้ว */
export async function countCardsWithLabel(orgId, labelId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n
       FROM kanban_card_labels cl
       JOIN kanban_cards c ON c.id = cl.card_id
      WHERE c.org_id = $1 AND cl.label_id = $2 AND c.archived_at IS NULL`,
    [orgId, labelId]
  )
  return rows[0].n
}
