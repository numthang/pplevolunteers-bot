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
     LEFT JOIN dc_members m ON m.discord_id = dp.discord_id AND m.guild_id = dp.guild_id
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
 * คืน payers ที่ scope ครอบคลุม eventProvince
 * - scope_nodes ว่าง → ไม่ include ในโครงการใดเลย (ไม่มีอำนาจลงนามตามจังหวัด)
 * - scope_nodes มีค่า → expand (finance mode = regional ครอบทั้งภาค) แล้วเช็ค province
 * ถ้า eventProvince เป็น null → คืนทั้งหมด (หน้า settings ดูภาพรวม)
 */
export async function getPayersForEvent(guildId, eventProvince) {
  const all = await getPayers(guildId)
  if (!eventProvince) return all

  return all.filter(p => {
    if (!p.scope_nodes.length) return false  // ไม่มีอำนาจลงนาม → ไม่รับผิดชอบจังหวัดใด
    const provinces = expandGrants(p.scope_nodes, { mode: 'finance' })
    return provinces.has(eventProvince)
  })
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
