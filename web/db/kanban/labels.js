// web/db/kanban/labels.js — ป้ายของการบ้าน (มี "กลุ่ม" กำกับ)
//
// ป้ายกลไกเดียวครอบ 3 อย่างที่ AppFlowy แยกเป็น 3 field: สายงาน · พื้นที่ · อุปกรณ์
// (md/kanban/CUSTOM-FIELDS.md — เลือกได้หลายค่าจากรายการ = เรื่องเดียวกันเป๊ะ)
//
// ⛔ ห้ามมีชื่อกลุ่มใดๆ hardcode ในโค้ด — 'พื้นที่'/'สายงาน' เป็นข้อมูลที่ org ตั้งเอง
//    org กรุงเทพอาจตั้งกลุ่ม "เขต" · ทีมชาติตั้ง "ภาค" · โค้ดต้องไม่รู้จักชื่อพวกนี้เลย
import pool from '../index.js'

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

/**
 * หาป้ายเดิม หรือสร้างใหม่ถ้ายังไม่มี — ใช้ตอน import และตอนคนพิมพ์ป้ายใหม่ในกล่อง
 * ⚠️ unique index ใช้ COALESCE(group_name, '') → ON CONFLICT ปกติจับไม่ได้ ต้อง SELECT ก่อน
 */
export async function ensureLabel(orgId, { name, groupName = null, color = null }) {
  const clean = String(name || '').trim()
  if (!clean) return null

  const { rows: found } = await pool.query(
    `SELECT id, group_name, name, color FROM kanban_labels
      WHERE org_id = $1 AND COALESCE(group_name, '') = COALESCE($2, '') AND name = $3`,
    [orgId, groupName, clean]
  )
  if (found[0]) return found[0]

  const { rows } = await pool.query(
    `INSERT INTO kanban_labels (org_id, group_name, name, color)
     VALUES ($1, $2, $3, $4)
     RETURNING id, group_name, name, color`,
    [orgId, groupName, clean, color]
  )
  return rows[0]
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

    await client.query(`DELETE FROM kanban_card_labels WHERE card_id = $1`, [cardId])
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

/** ซ่อนป้าย (ไม่ลบ) — การ์ดที่ติดอยู่ยังเก็บความสัมพันธ์ไว้ */
export async function archiveLabel(orgId, labelId) {
  const { rows } = await pool.query(
    `UPDATE kanban_labels SET archived_at = now()
      WHERE org_id = $1 AND id = $2 AND archived_at IS NULL RETURNING id`,
    [orgId, labelId]
  )
  return Boolean(rows[0])
}

/** จำนวนการ์ดที่ติดป้ายนี้ — ให้ UI เตือนก่อนซ่อน/ลบ */
export async function countCardsWithLabel(orgId, labelId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n
       FROM kanban_card_labels cl
       JOIN kanban_cards c ON c.id = cl.card_id
      WHERE c.org_id = $1 AND cl.label_id = $2`,
    [orgId, labelId]
  )
  return rows[0].n
}
