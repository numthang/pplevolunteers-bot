import pool from '@/db/index.js'

/**
 * org_scope_nodes — ผังพื้นที่ของ org (ต้นไม้ ซ้อนกี่ชั้นก็ได้)
 *
 * เดิมมีทางเกิดทางเดียวคือ derivative จาก Discord (syncRoleDefFromGuildRole อ่าน
 * dc_guild_roles.scope_node + parent_role_id) → org ที่ไม่มี Discord ได้ node แบน
 * ไม่มีสายบังคับบัญชา → reduceRoleDefs ไล่ชั้นให้ regional_coordinator ไม่ได้
 * ที่นี่คือทางเกิดทางที่สอง: admin จัดผังเอง
 *
 * ⚠️ `key` แก้ไม่ได้หลังสร้าง — เป็นตัวที่ scopeGrants คืนออกไป แล้วเอาไปเทียบตรงๆ
 *    กับ account.province / campaign province ในข้อมูลจริง (financeAccess/callingAccess)
 *    เปลี่ยน key = สิทธิ์ของทุกคนที่ถือ node นี้หลุดเงียบๆ · เปลี่ยนได้แค่ label
 *
 * ⚠️ ทุกฟังก์ชันที่เขียน ผู้เรียกต้องล้าง cache เอง (clearScopeTreeCache + clearAccessCache)
 *    — loadOrgTree cache 5 นาที ไม่ล้างแล้วจะได้อาการ "แก้แล้วไม่เปลี่ยน"
 */

/** ผังทั้ง org — เรียงให้ประกอบเป็นต้นไม้ฝั่ง client ได้เลย */
export async function listScopeNodes(orgId) {
  const { rows } = await pool.query(
    `SELECT n.id, n.key, n.label, n.parent_id, n.sort_order,
            (SELECT COUNT(*)::int FROM org_scope_nodes c WHERE c.parent_id = n.id)      AS child_count,
            (SELECT COUNT(*)::int FROM org_role_defs d WHERE d.scope_node_id = n.id)    AS role_def_count
       FROM org_scope_nodes n
      WHERE n.org_id = $1
      ORDER BY n.sort_order, n.label`,
    [orgId]
  )
  return rows
}

/**
 * ไล่บรรพบุรุษของ node — ใช้กันวนลูปตอนย้าย parent
 * DDL กันแค่ชี้ตัวเอง (ck_org_scope_nodes_no_self_parent) วง A→B→A ยังสร้างได้
 * ถ้าปล่อย: expandScope ไม่แฮงค์ (มี seen guard) แต่คนถือ A จะได้ B และกลับกัน
 * = สิทธิ์กว้างขึ้นเงียบๆ
 */
async function ancestorIds(orgId, nodeId) {
  const { rows } = await pool.query(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id FROM org_scope_nodes WHERE org_id = $1 AND id = $2
       UNION ALL
       SELECT n.id, n.parent_id FROM org_scope_nodes n JOIN up ON n.id = up.parent_id
     ) SELECT id FROM up`,
    [orgId, nodeId]
  )
  return rows.map(r => r.id)
}

/** parent ที่เสนอมาใช้ได้ไหม — ต้องอยู่ org เดียวกัน และไม่ใช่ลูกหลานของตัวเอง */
async function validateParent(orgId, nodeId, parentId) {
  if (parentId == null) return null
  const { rows } = await pool.query(
    `SELECT 1 FROM org_scope_nodes WHERE org_id = $1 AND id = $2`,
    [orgId, parentId]
  )
  if (rows.length === 0) return 'ไม่พบพื้นที่แม่ที่เลือก'
  if (nodeId != null) {
    if (parentId === nodeId) return 'ตั้งตัวเองเป็นพื้นที่แม่ไม่ได้'
    // ตัวมันเองอยู่ในสายบรรพบุรุษของ parent = ย้ายลงไปใต้ลูกตัวเอง → วนลูป
    const chain = await ancestorIds(orgId, parentId)
    if (chain.includes(nodeId)) return 'ย้ายไปอยู่ใต้พื้นที่ลูกของตัวเองไม่ได้ (จะวนลูป)'
  }
  return null
}

/** สร้าง node ใหม่ · คืน { node } หรือ { error } */
export async function createScopeNode(orgId, { key, label, parentId = null, sortOrder = 100 }) {
  const k = (key || '').trim()
  const l = (label || '').trim() || k
  if (!k) return { error: 'ต้องมีรหัสพื้นที่' }
  if (k.length > 80) return { error: 'รหัสพื้นที่ยาวเกิน 80 ตัวอักษร' }
  if (l.length > 120) return { error: 'ชื่อพื้นที่ยาวเกิน 120 ตัวอักษร' }

  const bad = await validateParent(orgId, null, parentId)
  if (bad) return { error: bad }

  const { rows } = await pool.query(
    `INSERT INTO org_scope_nodes (org_id, key, label, parent_id, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, key) DO NOTHING
     RETURNING id, key, label, parent_id, sort_order`,
    [orgId, k, l, parentId, sortOrder]
  )
  if (rows.length === 0) return { error: `มีพื้นที่รหัส "${k}" อยู่แล้ว` }
  return { node: { ...rows[0], child_count: 0, role_def_count: 0 } }
}

/** แก้ label / parent / sort_order (key แก้ไม่ได้ — ดูหัวไฟล์) */
export async function updateScopeNode(orgId, nodeId, { label, parentId, sortOrder }) {
  const sets = []
  const vals = [orgId, nodeId]

  if (label !== undefined) {
    const l = (label || '').trim()
    if (!l) return { error: 'ชื่อพื้นที่ว่างไม่ได้' }
    if (l.length > 120) return { error: 'ชื่อพื้นที่ยาวเกิน 120 ตัวอักษร' }
    vals.push(l); sets.push(`label = $${vals.length}`)
  }
  if (parentId !== undefined) {
    const bad = await validateParent(orgId, nodeId, parentId)
    if (bad) return { error: bad }
    vals.push(parentId); sets.push(`parent_id = $${vals.length}`)
  }
  if (sortOrder !== undefined) {
    vals.push(Number(sortOrder) || 0); sets.push(`sort_order = $${vals.length}`)
  }
  if (sets.length === 0) return { error: 'ไม่มีอะไรให้แก้' }

  const { rows } = await pool.query(
    `UPDATE org_scope_nodes SET ${sets.join(', ')}
      WHERE org_id = $1 AND id = $2
      RETURNING id, key, label, parent_id, sort_order`,
    vals
  )
  if (rows.length === 0) return { error: 'ไม่พบพื้นที่' }
  return { node: rows[0] }
}

/**
 * ลบ node — กันไว้แน่นกว่าที่ DDL กำหนดโดยตั้งใจ
 *
 * DDL เป็น `parent_id ON DELETE CASCADE` + `org_role_defs.scope_node_id ON DELETE SET NULL`
 * → ถ้าปล่อยให้ลบตามนั้น กดลบ "ภาคกลาง" ครั้งเดียว = ทุกจังหวัดใต้มันหายตาม แล้วทุกใบยศ
 * ที่ชี้จังหวัดพวกนั้นกลายเป็น scope_node_id NULL พร้อมกัน = คนเป็นร้อยหลุดพื้นที่เงียบๆ
 * และไม่เหลือข้อมูลว่าใบไหนเคยชี้ไหน (กู้ไม่ได้)
 * → ที่นี่บล็อกไว้ ต้องย้ายลูก/ปลดใบยศออกก่อนถึงจะลบได้
 */
export async function deleteScopeNode(orgId, nodeId) {
  const { rows } = await pool.query(
    `SELECT n.label,
            (SELECT COUNT(*)::int FROM org_scope_nodes c WHERE c.parent_id = n.id)   AS child_count,
            (SELECT COUNT(*)::int FROM org_role_defs d WHERE d.scope_node_id = n.id) AS role_def_count
       FROM org_scope_nodes n WHERE n.org_id = $1 AND n.id = $2`,
    [orgId, nodeId]
  )
  const n = rows[0]
  if (!n) return { error: 'ไม่พบพื้นที่' }
  if (n.child_count > 0) return { error: `"${n.label}" มีพื้นที่ย่อยอยู่ ${n.child_count} รายการ — ย้ายออกก่อน` }
  if (n.role_def_count > 0) return { error: `"${n.label}" ยังมียศผูกอยู่ ${n.role_def_count} ใบ — ปลดก่อน` }

  await pool.query(`DELETE FROM org_scope_nodes WHERE org_id = $1 AND id = $2`, [orgId, nodeId])
  return { ok: true }
}
