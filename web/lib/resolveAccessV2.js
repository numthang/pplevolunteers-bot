/**
 * resolveAccessV2 — สิทธิ์ + พื้นที่ จาก org (ไม่ผูก Discord)
 * แบบเต็ม: md/ORG_ACCESS_REDESIGN.md
 *
 * ⚠️ ยังไม่ถูกใช้จริง — เขียนคู่ขนานกับ resolveAccess.js เดิม (ขั้น 3 ของแผน)
 *    สลับตอนขั้น 4 ที่ getEffectiveOrgIdentity
 *
 * ต่างจากของเดิม 3 อย่าง:
 *   1. อ่านจาก org_member_roles / org_role_defs / org_scope_nodes (ไม่แตะ dc_guild_roles)
 *   2. key ด้วย (orgId, userId) แทน (guildId, roleNames)
 *   3. **คืน scopeGrants ที่ไล่ชั้นเสร็จแล้ว** — ถือ node ไหน = ได้ทุก node ใต้มัน
 *      เหมือนกันทุกแอพ (เคาะ 2026-07-22) → เลิกใช้ geography.js + expandGrants({mode})
 *      ของเดิมคืน grant ดิบ ('province:ราชบุรี') แล้วให้แต่ละแอพ expand เอง คนละกติกา
 *
 * โครงสร้าง 2 ชั้น — จำเป็นสำหรับ view-as-role (debug):
 *   loadOrgTree()      → โหลดต้นไม้พื้นที่ (cached)
 *   reduceRoleDefs()   → pure: role def rows + tree → { permissions, scopeGrants }
 *   resolveAccessV2()  → ทางจริง: โหลดตำแหน่งของ user แล้วเรียก reducer
 *   accessFromRoleNames() → ทางดีบั๊ก: รับ "ชื่อตำแหน่ง" สมมติ แล้วเรียก reducer ตัวเดียวกัน
 * (ถ้าไม่แยกชั้น view-as-role จะพัง เพราะไม่มีช่องยัดยศสมมติ)
 */

import pool from '@/db/index.js'

const CACHE_TTL_MS = 5 * 60 * 1000
const _treeCache = new Map()  // orgId → { at, byId: Map<id, {key, parentId}>, childrenOf: Map<id, id[]> }

/** ล้าง cache ต้นไม้พื้นที่ (เรียกหลังแก้โครงพื้นที่) — ไม่ส่ง orgId = ล้างหมด */
export function clearScopeTreeCache(orgId) {
  if (orgId) _treeCache.delete(orgId)
  else _treeCache.clear()
}

/** โหลดต้นไม้พื้นที่ของ org (cached) */
export async function loadOrgTree(orgId) {
  const hit = _treeCache.get(orgId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit

  const { rows } = await pool.query(
    `SELECT id, key, parent_id FROM org_scope_nodes WHERE org_id = $1`,
    [orgId]
  )
  const byId = new Map()
  const childrenOf = new Map()
  for (const r of rows) {
    byId.set(r.id, { key: r.key, parentId: r.parent_id })
    if (r.parent_id != null) {
      if (!childrenOf.has(r.parent_id)) childrenOf.set(r.parent_id, [])
      childrenOf.get(r.parent_id).push(r.id)
    }
  }
  const tree = { at: Date.now(), byId, childrenOf }
  _treeCache.set(orgId, tree)
  return tree
}

/**
 * ไล่ลูกทั้งหมดใต้ node ที่ถือ (รวมตัวมันเอง) → Set ของ key
 * pure + กันวนลูป (parent ชี้กลับมาหาลูกได้ในทางทฤษฎี — DDL กันแค่ชี้ตัวเอง)
 * @param {number[]} nodeIds
 * @param {{byId: Map, childrenOf: Map}} tree
 */
export function expandScope(nodeIds, tree) {
  const out = new Set()
  const seen = new Set()
  const stack = [...nodeIds]
  while (stack.length) {
    const id = stack.pop()
    if (id == null || seen.has(id)) continue   // seen = กันวนลูป
    seen.add(id)
    const node = tree.byId.get(id)
    if (!node) continue
    out.add(node.key)
    for (const childId of tree.childrenOf.get(id) || []) stack.push(childId)
  }
  return out
}

/** permission ที่ "ไล่ชั้นลงไปได้" — ดูแลทั้งกิ่งที่ถือ ไม่ใช่แค่ node นั้น */
const EXPANDING_PERMISSIONS = ['regional_coordinator']

/**
 * pure reducer — role def rows ที่ user ถือ → { permissions, scopeGrants }
 * แยกออกมาเพื่อ (ก) test ได้โดยไม่แตะ DB (ข) view-as-role ยัดยศสมมติเข้ามาได้
 *
 * ⚠️ **การไล่ชั้นถูกกั้นด้วยตำแหน่ง ไม่ใช่ด้วยรูปร่างต้นไม้** (user ยืนยัน 2026-07-22
 *    ว่านี่คือกฎดั้งเดิม): ยศ "ทีม<ภาค>" บน Discord ติดอัตโนมัติให้ทุกคนที่กดเลือก
 *    จังหวัด (addRoleWithParents ใน db/guildRoles.js) → มีกันเป็นพัน ถ้าไล่ชั้นให้ทุกคน
 *    ที่ถือ node มีลูก คนที่แค่กดเลือกจังหวัดจะเห็นข้อมูลทั้งภาค (วัดแล้ว: caseworker
 *    483/894 คนจะกว้างขึ้นเฉลี่ย 1.1→5.5 จังหวัด)
 *    → ไล่ชั้นเฉพาะคนที่มีตำแหน่งระดับภาค (ผู้ประสานงานภาค / รองเลขาธิการ)
 *    → คนอื่นได้เฉพาะ node ที่ถือตรงๆ · ชื่อภาคที่ติดมาเองอยู่ในเซ็ตได้ ไม่มีผล
 *      เพราะไม่เคยแมตช์กับ "จังหวัด" ของข้อมูลจริง
 *
 * @param {Array<{permission: string|null, scope_node_id: number|null}>} defs
 * @param {{byId: Map, childrenOf: Map}} tree
 */
export function reduceRoleDefs(defs, tree) {
  const permissions = new Set()
  const nodeIds = []
  for (const d of defs) {
    if (d.permission) permissions.add(d.permission)
    if (d.scope_node_id != null) nodeIds.push(d.scope_node_id)
  }

  const canExpand = EXPANDING_PERMISSIONS.some(p => permissions.has(p))
  const keys = canExpand
    ? expandScope(nodeIds, tree)
    : new Set(nodeIds.map(id => tree.byId.get(id)?.key).filter(Boolean))

  return { permissions, scopeGrants: Array.from(keys) }
}

/**
 * ทางจริง — สิทธิ์ของ user ใน org
 * @returns {Promise<{ isMember: boolean, permissions: Set<string>, scopeGrants: string[] }>}
 *
 * isMember = มีแถวใน org_members ของ org นี้ (ไม่ใช่ "มีตำแหน่ง")
 * fail-safe: ไม่ใช่สมาชิก → ไม่มีสิทธิ์อะไรเลย
 */
export async function resolveAccessV2(orgId, userId) {
  const empty = { isMember: false, permissions: new Set(), scopeGrants: [] }
  if (!orgId || !userId) return empty

  const { rows: memberRows } = await pool.query(
    `SELECT 1 FROM org_members WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  )
  if (memberRows.length === 0) return empty

  const [{ rows: defs }, tree] = await Promise.all([
    pool.query(
      `SELECT d.permission, d.scope_node_id
         FROM org_member_roles mr
         JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active
        WHERE mr.org_id = $1 AND mr.user_id = $2`,
      [orgId, userId]
    ),
    loadOrgTree(orgId),
  ])

  return { isMember: true, ...reduceRoleDefs(defs, tree) }
}

/**
 * ทางดีบั๊ก (view-as-role) — รับ "ชื่อตำแหน่ง" สมมติ แล้วคำนวณเหมือนของจริง
 * ใช้ reducer ตัวเดียวกับทางจริง → ผลที่เห็นตอน preview ตรงกับของจริงเสมอ
 * @param {number} orgId
 * @param {string[]} roleNames  ชื่อใน org_role_defs (เช่น ['ผู้ประสานงานจังหวัด','ทีมราชบุรี'])
 */
export async function accessFromRoleNames(orgId, roleNames = []) {
  const empty = { isMember: false, permissions: new Set(), scopeGrants: [] }
  if (!orgId) return empty
  if (roleNames.length === 0) return { isMember: true, permissions: new Set(), scopeGrants: [] }

  const [{ rows: defs }, tree] = await Promise.all([
    pool.query(
      `SELECT permission, scope_node_id FROM org_role_defs
        WHERE org_id = $1 AND is_active AND name = ANY($2)`,
      [orgId, roleNames]
    ),
    loadOrgTree(orgId),
  ])

  return { isMember: true, ...reduceRoleDefs(defs, tree) }
}
