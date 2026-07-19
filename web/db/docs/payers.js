import pool from '../index.js'
import { expandGrants } from '../../lib/geography.js'
import { resolveAccess } from '../../lib/resolveAccess.js'

/**
 * คำนวณ scope ของ payer แบบ permission-gated (เหมือน calling — scope_node เปล่าๆ ไม่นับ)
 * ต้องมี permission "อำนาจลงนาม" ก่อน scope_node ถึงจะมีผล:
 *   - province_coordinator / district_coordinator → ใช้ province: grants (จังหวัดที่ติดยศ)
 *   - regional_coordinator                        → expand region:/subregion: ได้ทั้งภาคใหญ่ (finance mode)
 *   - admin / moderator เพียวๆ                    → ไม่นับ (เป็น role ระบบ ไม่ใช่ผู้ลงนาม)
 * @returns {string[]} gated scope_nodes รูปแบบ "type:value" เช่น ['province:ราชบุรี']
 */
function gatedScopeNodes(permissions, scopeGrants) {
  const nodes = []
  const isProvincial = permissions.has('province_coordinator') || permissions.has('district_coordinator')
  const isRegional   = permissions.has('regional_coordinator')

  if (isProvincial) {
    for (const g of scopeGrants) if (g.startsWith('province:')) nodes.push(g)
  }
  if (isRegional) {
    for (const g of scopeGrants) if (g.startsWith('region:') || g.startsWith('subregion:')) nodes.push(g)
  }
  return [...new Set(nodes)]
}

/** คืน payer ทั้งหมดใน guild พร้อม scope_nodes ที่ผ่าน permission gate แล้ว */
export async function getPayers(guildId) {
  const { rows } = await pool.query(
    `SELECT dp.id, dp.guild_id, dp.discord_id, dp.display_name, dp.position, dp.sort_order,
            (dp.signature_base64 IS NOT NULL) AS has_static_sig,
            m.roles
     FROM docs_payers dp
     LEFT JOIN users u      ON u.discord_id = dp.discord_id
     LEFT JOIN org_members m ON m.user_id = u.id AND m.guild_id = dp.guild_id
     WHERE dp.guild_id = $1
     ORDER BY dp.sort_order, dp.id`,
    [guildId]
  )

  return Promise.all(rows.map(async ({ roles, ...p }) => {
    const roleNames = roles ? roles.split(',').map(r => r.trim()).filter(Boolean) : []
    const { permissions, scopeGrants } = await resolveAccess(guildId, roleNames)
    return { ...p, scope_nodes: gatedScopeNodes(permissions, scopeGrants) }
  }))
}

/**
 * Query org_members ที่มี permission นี้ แล้วกรองตาม scope coverage
 * - province_coordinator → ตรวจเฉพาะ province: scope nodes
 * - regional_coordinator → ตรวจ region:/subregion: scope nodes
 * คืน members เรียงโดย primary_province == eventProvince ก่อน
 */
async function queryPayersByPermission(guildId, permission, eventProvince) {
  const isProvincial = permission === 'province_coordinator' || permission === 'district_coordinator'

  const { rows } = await pool.query(
    `WITH member_roles AS (
       SELECT u.discord_id, m.display_name, m.primary_province,
              u.firstname, u.lastname, m.member_id,
              trim(unnest(string_to_array(m.roles, ','))) AS role_name
       FROM org_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.guild_id = $1 AND m.roles IS NOT NULL AND m.roles != ''
     ),
     has_permission AS (
       SELECT DISTINCT mr.discord_id
       FROM member_roles mr
       JOIN dc_guild_roles gr ON gr.guild_id = $1 AND gr.role_name = mr.role_name
       WHERE gr.permission = $2
     )
     SELECT mr.discord_id, mr.display_name, mr.primary_province,
            COALESCE(n.first_name, mr.firstname) AS firstname,
            COALESCE(n.last_name,  mr.lastname)  AS lastname,
            array_agg(DISTINCT gr.scope_node) FILTER (WHERE gr.scope_node IS NOT NULL) AS scope_nodes,
            (array_agg(DISTINCT gr.role_name) FILTER (WHERE gr.permission = $2))[1] AS position
     FROM member_roles mr
     JOIN dc_guild_roles gr ON gr.guild_id = $1 AND gr.role_name = mr.role_name
     LEFT JOIN cache_pple_member n ON n.source_id = mr.member_id
     WHERE mr.discord_id IN (SELECT discord_id FROM has_permission)
     GROUP BY mr.discord_id, mr.display_name, mr.primary_province, mr.firstname, mr.lastname, n.first_name, n.last_name`,
    [guildId, permission]
  )

  // Apply gatedScopeNodes logic per permission type, then filter by province coverage
  // position = ชื่อ role ที่ให้ permission นี้ (เช่น 'ผู้ประสานงานจังหวัด') → ใช้เป็นตำแหน่งบน PDF
  const matched = rows
    .map(r => ({
      ...r,
      scope_nodes: (r.scope_nodes || []).filter(g =>
        isProvincial
          ? g.startsWith('province:')
          : g.startsWith('region:') || g.startsWith('subregion:')
      ),
    }))
    .filter(r => {
      if (!r.scope_nodes.length) return false
      return expandGrants(r.scope_nodes, { mode: 'finance' }).has(eventProvince)
    })

  matched.sort((a, b) => {
    const aHome = a.primary_province === eventProvince ? 0 : 1
    const bHome = b.primary_province === eventProvince ? 0 : 1
    if (aHome !== bHome) return aHome - bHome
    // secondary: scope น้อยกว่า = รับผิดชอบตรงกว่า (province เดียว > ผู้ดูแลหลายจังหวัด)
    return a.scope_nodes.length - b.scope_nodes.length
  })

  return matched
}

/**
 * คืน payers ทั้งหมดที่มีสิทธิ์รับผิดชอบ eventProvince (รวมทุก level ไม่ fallback):
 *   1. province_coordinator + scope ครอบ (specific สุด — เรียงก่อน)
 *   2. regional_coordinator + scope ครอบ
 *   3. docs_payers manual list + scope ครอบ (safety net)
 *   deduplicate ด้วย discord_id ให้คนเดียวโชว์ครั้งเดียว
 * ถ้า eventProvince เป็น null → คืน getPayers ทั้งหมด (หน้า settings ดูภาพรวม)
 */
export async function getPayersForEvent(guildId, eventProvince) {
  if (!eventProvince) return getPayers(guildId)

  const [level1, level2, manualPayers] = await Promise.all([
    queryPayersByPermission(guildId, 'province_coordinator', eventProvince),
    queryPayersByPermission(guildId, 'regional_coordinator', eventProvince),
    getPayers(guildId),
  ])

  // docs_payers = manual list — กรองด้วย scope coverage เหมือน role-based
  // (gatedScopeNodes รวม region/subregion ของ regional_coordinator → expandGrants finance ครอบทั้งภาค)
  const level3 = manualPayers.filter(p => {
    if (!p.scope_nodes.length) return false
    return expandGrants(p.scope_nodes, { mode: 'finance' }).has(eventProvince)
  })

  // รวม + deduplicate (province_coordinator ก่อน เพราะ specific กว่า)
  const seen = new Set()
  const result = []
  for (const p of [...level1, ...level2, ...level3]) {
    if (!seen.has(p.discord_id)) {
      seen.add(p.discord_id)
      result.push(p)
    }
  }

  // position = ยศสูงสุดที่คนนั้นถือ (ไม่ใช่ level ที่ qualify เข้า pool)
  // เช่น Jatsada เป็น province_coordinator แต่ถือ รองเลขาธิการ (regional) → แสดง รองเลขาธิการ
  const positions = await getHighestPositions(guildId, result.map(p => p.discord_id))
  for (const p of result) {
    if (positions[p.discord_id]) p.position = positions[p.discord_id]
  }
  return result
}

/**
 * คืน map discord_id → ชื่อ role ตำแหน่ง "ยศสูงสุด" ที่ถือ (จัดอันดับด้วย permission token)
 * secretary_general > regional_coordinator > province_coordinator > district_coordinator
 */
async function getHighestPositions(guildId, discordIds) {
  if (!discordIds.length) return {}
  const { rows } = await pool.query(
    `WITH mr AS (
       SELECT u.discord_id, trim(unnest(string_to_array(m.roles, ','))) AS role_name
       FROM org_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.guild_id = $1 AND u.discord_id = ANY($2) AND m.roles IS NOT NULL
     )
     SELECT DISTINCT ON (mr.discord_id) mr.discord_id, gr.role_name
     FROM mr
     JOIN dc_guild_roles gr ON gr.guild_id = $1 AND gr.role_name = mr.role_name
     WHERE gr.permission IN ('secretary_general','regional_coordinator','province_coordinator','district_coordinator')
     ORDER BY mr.discord_id,
       CASE gr.permission
         WHEN 'secretary_general'    THEN 1
         WHEN 'regional_coordinator' THEN 2
         WHEN 'province_coordinator' THEN 3
         WHEN 'district_coordinator' THEN 4
       END,
       gr.role_name`,
    [guildId, discordIds]
  )
  return Object.fromEntries(rows.map(r => [r.discord_id, r.role_name]))
}

export async function addPayer(guildId, { discordId, displayName, position, sortOrder = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO docs_payers (guild_id, discord_id, display_name, position, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (guild_id, discord_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       position     = EXCLUDED.position,
       sort_order   = EXCLUDED.sort_order
     RETURNING id, discord_id, display_name, position, sort_order`,
    [guildId, discordId, displayName, position, sortOrder]
  )
  return rows[0]
}

export async function updatePayer(id, guildId, { displayName, position, sortOrder }) {
  const { rows } = await pool.query(
    `UPDATE docs_payers SET
       display_name = COALESCE($3, display_name),
       position     = COALESCE($4, position),
       sort_order   = COALESCE($5, sort_order)
     WHERE id = $1 AND guild_id = $2
     RETURNING id, discord_id, display_name, position, sort_order`,
    [id, guildId, displayName ?? null, position ?? null, sortOrder ?? null]
  )
  return rows[0] || null
}

export async function removePayer(id, guildId) {
  const { rowCount } = await pool.query(
    `DELETE FROM docs_payers WHERE id = $1 AND guild_id = $2`,
    [id, guildId]
  )
  return rowCount > 0
}
