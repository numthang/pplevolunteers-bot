import pool from '../index.js'
import { loadOrgTree, reduceRoleDefs } from '../../lib/resolveAccessV2.js'

/**
 * ผู้มีอำนาจลงนาม — อ่านสิทธิ์จาก org_member_roles เหมือนทั้งระบบ (ORG_ACCESS_REDESIGN ขั้น 5)
 *
 * เดิมไฟล์นี้เป็น **เส้นทางแยก**: คำนวณเองจาก dc_guild_roles + org_members.roles
 * ผ่าน resolveAccess เดิม + expandGrants(geography.js) → มองไม่เห็นสิทธิ์ที่ตั้งผ่านเว็บ
 * ตอนนี้ใช้ reducer ตัวเดียวกับ resolveAccessV2 → เห็นทุกอย่างที่ระบบเห็น
 *
 * gate เดิมยังอยู่: ต้องมี permission "อำนาจลงนาม" ก่อน พื้นที่ถึงจะมีผล
 * (admin / moderator เพียวๆ ไม่นับ — เป็น role ระบบ ไม่ใช่ผู้ลงนาม)
 *
 * ⚠️ เลิกแยก prefix province:/region:/subregion: แล้ว — โครงใหม่ไม่มี prefix และ
 *    การไล่ชั้นถูกกั้นด้วย "ตำแหน่ง" ใน reduceRoleDefs อยู่แล้ว: regional_coordinator
 *    ได้ทั้งกิ่ง · ที่เหลือได้เฉพาะ node ที่ถือตรงๆ → ผลเท่าเดิมโดยไม่ต้องกรองชื่อ
 */
const SIGNER_PERMISSIONS = ['province_coordinator', 'district_coordinator', 'regional_coordinator']

/**
 * สิทธิ์ + พื้นที่ ของ user หลายคนพร้อมกัน (query เดียว) — ใช้ reducer ตัวเดียวกับ resolveAccessV2
 * @returns {Promise<Map<number, { permissions: Set, coverage: Set, nodes: Array }>>}
 *   coverage = พื้นที่ที่ครอบถึง (ไล่ชั้นแล้ว) ใช้ตัดสินว่ารับผิดชอบจังหวัดนี้ไหม
 *   nodes    = พื้นที่ที่ "ถือจริง" ใช้แสดงผล (ไม่ใช่ coverage — ผู้ประสานงานภาคจะกลายเป็น badge เป็นสิบ)
 */
async function accessForUsers(orgId, userIds) {
  const out = new Map()
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return out

  const [tree, { rows }] = await Promise.all([
    loadOrgTree(orgId),
    pool.query(
      `SELECT mr.user_id, d.permission, d.scope_node_id,
              n.key AS node_key, n.label AS node_label,
              EXISTS (SELECT 1 FROM org_scope_nodes c WHERE c.parent_id = n.id) AS node_wide
         FROM org_member_roles mr
         JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active
         LEFT JOIN org_scope_nodes n ON n.id = d.scope_node_id
        WHERE mr.org_id = $1 AND mr.user_id = ANY($2::int[])`,
      [orgId, ids]
    ),
  ])

  const byUser = new Map()
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, [])
    byUser.get(r.user_id).push(r)
  }

  for (const id of ids) {
    const defs = byUser.get(id) || []
    const { permissions, scopeGrants } = reduceRoleDefs(defs, tree)
    const isSigner = SIGNER_PERMISSIONS.some(p => permissions.has(p))
    const nodes = isSigner
      ? [...new Map(defs.filter(d => d.node_key)
          .map(d => [d.node_key, { key: d.node_key, label: d.node_label, wide: d.node_wide }])).values()]
      : []
    out.set(id, { permissions, coverage: isSigner ? new Set(scopeGrants) : new Set(), nodes })
  }
  return out
}

/** คืน payer ทั้งหมดใน org พร้อมพื้นที่ที่ผ่าน permission gate แล้ว + coverage ไว้ใช้ภายใน
 *  (ไม่ต้อง union ราย guild อีก — org_member_roles เป็น org-level อยู่แล้ว) */
async function loadPayers(orgId) {
  const { rows } = await pool.query(
    `SELECT dp.id, dp.org_id, dp.user_id, dp.display_name, dp.position, dp.sort_order,
            (dp.signature_base64 IS NOT NULL) AS has_static_sig
     FROM docs_payers dp
     WHERE dp.org_id = $1
     ORDER BY dp.sort_order, dp.id`,
    [orgId]
  )
  if (!rows.length) return []

  const access = await accessForUsers(orgId, rows.map(r => r.user_id))
  return rows.map(p => {
    const a = access.get(p.user_id)
    return { ...p, scope_nodes: a?.nodes || [], coverage: a?.coverage || new Set() }
  })
}

// coverage เป็น Set ไว้ใช้ภายใน — JSON.stringify แปลงเป็น {} ต้องตัดออกก่อนส่งออก API
const stripCoverage = list => list.map(({ coverage, ...p }) => p)

export async function getPayers(orgId) {
  return stripCoverage(await loadPayers(orgId))
}

/**
 * คนใน org ที่ถือ permission นี้ แล้วกรองด้วย coverage ว่ารับผิดชอบ eventProvince จริง
 * คืน members เรียงโดย primary_province == eventProvince ก่อน
 *
 * position = ชื่อตำแหน่งที่ให้ permission นี้ (เช่น 'ผู้ประสานงานจังหวัด') → ใช้บน PDF
 */
async function queryPayersByPermission(orgId, permission, eventProvince) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (u.id)
            u.id AS user_id, u.discord_id, m.display_name, m.primary_province,
            COALESCE(n.first_name, u.firstname) AS firstname,
            COALESCE(n.last_name,  u.lastname)  AS lastname,
            d.name AS position
       FROM org_member_roles mr
       JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active AND d.permission = $2
       JOIN users u ON u.id = mr.user_id
       LEFT JOIN org_members m ON m.user_id = u.id AND m.org_id = mr.org_id
       LEFT JOIN cache_pple_member n ON n.source_id = m.member_id
      WHERE mr.org_id = $1
      ORDER BY u.id, (m.primary_province IS NOT NULL) DESC, d.name`,
    [orgId, permission]
  )
  if (!rows.length) return []

  const access = await accessForUsers(orgId, rows.map(r => r.user_id))
  const matched = rows
    .map(r => {
      const a = access.get(r.user_id)
      return { ...r, scope_nodes: a?.nodes || [], coverage: a?.coverage || new Set() }
    })
    .filter(r => r.coverage.has(eventProvince))

  matched.sort((a, b) => {
    const aHome = a.primary_province === eventProvince ? 0 : 1
    const bHome = b.primary_province === eventProvince ? 0 : 1
    if (aHome !== bHome) return aHome - bHome
    // secondary: พื้นที่ครอบน้อยกว่า = รับผิดชอบตรงกว่า (จังหวัดเดียว > ผู้ดูแลทั้งภาค)
    // นับ coverage ไม่ใช่ node ที่ถือ — ยศ "ทีม<ภาค>" ติดอัตโนมัติทำให้จำนวน node ที่ถือไม่มีความหมาย
    return a.coverage.size - b.coverage.size
  })

  return matched
}

/**
 * คืน payers ทั้งหมดที่มีสิทธิ์รับผิดชอบ eventProvince (รวมทุก level ไม่ fallback):
 *   1. province_coordinator + scope ครอบ (specific สุด — เรียงก่อน)
 *   2. regional_coordinator + scope ครอบ
 *   3. docs_payers manual list + scope ครอบ (safety net)
 *   deduplicate ด้วย user_id ให้คนเดียวโชว์ครั้งเดียว
 *   (ห้าม dedup ด้วย discord_id — payer ที่ล็อกอิน email มี discord_id = NULL ทุกคน
 *    → Set จะเก็บ NULL ตัวแรกแล้วทิ้งคนที่เหลือทั้งหมดเงียบๆ)
 * ถ้า eventProvince เป็น null → คืน getPayers ทั้งหมด (หน้า settings ดูภาพรวม)
 */
export async function getPayersForEvent(orgId, eventProvince) {
  if (!eventProvince) return getPayers(orgId)

  const [level1, level2, manualPayers] = await Promise.all([
    queryPayersByPermission(orgId, 'province_coordinator', eventProvince),
    queryPayersByPermission(orgId, 'regional_coordinator', eventProvince),
    loadPayers(orgId),
  ])

  // docs_payers = manual list — กรองด้วย coverage เหมือน role-based
  const level3 = manualPayers.filter(p => p.coverage.has(eventProvince))

  // รวม + deduplicate (province_coordinator ก่อน เพราะ specific กว่า)
  const seen = new Set()
  const result = []
  for (const p of [...level1, ...level2, ...level3]) {
    if (!seen.has(p.user_id)) {
      seen.add(p.user_id)
      result.push(p)
    }
  }

  // position = ยศสูงสุดที่คนนั้นถือ (ไม่ใช่ level ที่ qualify เข้า pool)
  // เช่น Jatsada เป็น province_coordinator แต่ถือ รองเลขาธิการ (regional) → แสดง รองเลขาธิการ
  const positions = await getHighestPositions(orgId, result.map(p => p.user_id))
  for (const p of result) {
    if (positions[p.user_id]) p.position = positions[p.user_id]
  }
  return stripCoverage(result)
}

/**
 * คืน map user_id → ชื่อ role ตำแหน่ง "ยศสูงสุด" ที่ถือ (จัดอันดับด้วย permission token)
 * secretary_general > regional_coordinator > province_coordinator > district_coordinator
 */
async function getHighestPositions(orgId, userIds) {
  if (!userIds.length) return {}
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (mr.user_id) mr.user_id, d.name
       FROM org_member_roles mr
       JOIN org_role_defs d ON d.id = mr.role_def_id AND d.is_active
      WHERE mr.org_id = $1 AND mr.user_id = ANY($2::int[])
        AND d.permission IN ('secretary_general','regional_coordinator','province_coordinator','district_coordinator')
      ORDER BY mr.user_id,
        CASE d.permission
          WHEN 'secretary_general'    THEN 1
          WHEN 'regional_coordinator' THEN 2
          WHEN 'province_coordinator' THEN 3
          WHEN 'district_coordinator' THEN 4
        END,
        d.name`,
    [orgId, userIds]
  )
  return Object.fromEntries(rows.map(r => [r.user_id, r.name]))
}

export async function addPayer(orgId, { userId, displayName, position, sortOrder = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO docs_payers (org_id, user_id, display_name, position, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (org_id, user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       position     = EXCLUDED.position,
       sort_order   = EXCLUDED.sort_order
     RETURNING id, user_id, display_name, position, sort_order`,
    [orgId, userId, displayName, position, sortOrder]
  )
  return rows[0]
}

export async function updatePayer(id, orgId, { displayName, position, sortOrder }) {
  const { rows } = await pool.query(
    `UPDATE docs_payers SET
       display_name = COALESCE($3, display_name),
       position     = COALESCE($4, position),
       sort_order   = COALESCE($5, sort_order)
     WHERE id = $1 AND org_id = $2
     RETURNING id, user_id, display_name, position, sort_order`,
    [id, orgId, displayName ?? null, position ?? null, sortOrder ?? null]
  )
  return rows[0] || null
}

export async function removePayer(id, orgId) {
  const { rowCount } = await pool.query(
    `DELETE FROM docs_payers WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  )
  return rowCount > 0
}
