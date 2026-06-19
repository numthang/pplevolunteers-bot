const pool = require('./index')

/**
 * Sync role catalog → dc_guild_roles (SPEC §4 step 6a)
 *
 * upsert "ทุก role" ของ guild เป็น catalog (guild_id, role_id, role_name)
 * — แตะแค่ role_name + updated_at · "ไม่แตะ" policy (permission/scope_node/picker_*)
 *   ที่ seed/admin ตั้งไว้ → re-sync กี่ครั้งก็ไม่ลบ config
 * - role ใหม่ที่ยังไม่มีแถว → insert ด้วย policy = null (fail-safe: ไม่มีสิทธิ์)
 * - rename หายเอง: match ด้วย role_id แล้วอัปเดต role_name
 *
 * ⚠️ web cache (resolveAccess) TTL 5 นาที → การเปลี่ยนจะมีผลฝั่ง web ภายใน ~5 นาที
 */

const UPSERT_SQL = `
  INSERT INTO dc_guild_roles (guild_id, role_id, role_name, is_managed)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (guild_id, role_id) DO UPDATE SET
    role_name  = EXCLUDED.role_name,
    is_managed = EXCLUDED.is_managed,
    updated_at = CURRENT_TIMESTAMP`

/** upsert ทุก role ของ guild — คืนจำนวน role ที่ sync */
async function syncGuildRolesCatalog(guild) {
  const roles = guild.roles.cache.filter(r => r.name !== '@everyone')
  let count = 0
  for (const role of roles.values()) {
    await pool.query(UPSERT_SQL, [guild.id, role.id, role.name, role.managed])
    count++
  }
  return count
}

/** upsert role เดียว (event roleCreate / roleUpdate) */
async function upsertGuildRole(role) {
  if (!role || role.name === '@everyone') return
  await pool.query(UPSERT_SQL, [role.guild.id, role.id, role.name, role.managed])
}

/** ลบ role ออกจาก catalog (event roleDelete) */
async function deleteGuildRole(role) {
  if (!role) return
  await pool.query(
    `DELETE FROM dc_guild_roles WHERE guild_id = $1 AND role_id = $2`,
    [role.guild.id, role.id]
  )
}

/**
 * ปุ่ม picker ของกลุ่ม (interest/skill/province) เรียงตาม picker_order (SPEC §6 step 6b)
 * คืน [{ roleId, label, emoji }] — render/แปะ ใช้ role_id เสมอ (ทน rename)
 */
async function getPickerRoles(guildId, groupKey) {
  const { rows } = await pool.query(
    `SELECT role_id, role_name, picker_label, picker_emoji
     FROM dc_guild_roles
     WHERE guild_id = $1 AND picker_group = $2
     ORDER BY picker_order NULLS LAST, role_name`,
    [guildId, groupKey]
  )
  return rows.map(r => ({
    roleId: r.role_id,
    label:  r.picker_label || r.role_name,
    emoji:  r.picker_emoji || null,
  }))
}

/** นิยามกลุ่ม picker (label, kind) — ใช้ทำ embed title; null ถ้าไม่มี */
async function getPickerGroup(guildId, groupKey) {
  const { rows } = await pool.query(
    `SELECT label, kind FROM dc_guild_role_groups WHERE guild_id = $1 AND group_key = $2`,
    [guildId, groupKey]
  )
  return rows[0] || null
}

// ─── in-memory cache: guildId → Map<roleName, roleId> ───────────────────────
// invalidate เมื่อ roleUpdate/Delete เพื่อให้ชื่อ rename มีผลทันที
const roleNameCache = new Map()

async function getRoleIdByName(guildId, roleName) {
  if (!roleNameCache.has(guildId)) {
    const { rows } = await pool.query(
      'SELECT role_id, role_name FROM dc_guild_roles WHERE guild_id = $1', [guildId])
    roleNameCache.set(guildId, new Map(rows.map(r => [r.role_name, r.role_id])))
  }
  return roleNameCache.get(guildId).get(roleName) ?? null
}

function invalidateGuildRoleCache(guildId) {
  roleNameCache.delete(guildId)
}

/** roles ที่มี scope_node ขึ้นต้นด้วย prefix เช่น 'province:', 'subregion:', 'region:' */
async function getRolesByScopePrefix(guildId, prefix) {
  const { rows } = await pool.query(
    `SELECT role_id, role_name, scope_node FROM dc_guild_roles
     WHERE guild_id = $1 AND scope_node LIKE $2`,
    [guildId, prefix + '%'])
  return rows
}

/**
 * add roleId + follow parent_role_id chain — แปะ parent ทุกชั้นที่ยังไม่มี
 * คืน array ของ parent role_id ที่ถูกเพิ่มจริง (ไม่รวม roleId เดิม) เรียงจากชั้นล่าง→บน
 */
async function addRoleWithParents(member, roleId) {
  const rolesToAdd = [roleId]
  const parentsAdded = []
  let current = roleId
  while (true) {
    const { rows } = await pool.query(
      'SELECT parent_role_id FROM dc_guild_roles WHERE guild_id = $1 AND role_id = $2',
      [member.guild.id, current])
    const parentId = rows[0]?.parent_role_id
    if (!parentId || member.roles.cache.has(parentId)) break
    rolesToAdd.push(parentId)
    parentsAdded.push(parentId)
    current = parentId
  }
  if (rolesToAdd.length) await member.roles.add([...new Set(rolesToAdd)])
  return parentsAdded
}

/**
 * remove roleId + cascade remove parent ถ้าไม่มี sibling เหลือในแต่ละชั้น
 * คืน array ของ parent role_id ที่ถูกถอดจริง เรียงจากชั้นล่าง→บน
 */
async function removeRoleWithParents(member, roleId) {
  await member.roles.remove(roleId)
  const parentsRemoved = []
  let current = roleId
  while (true) {
    const { rows: pr } = await pool.query(
      'SELECT parent_role_id FROM dc_guild_roles WHERE guild_id = $1 AND role_id = $2',
      [member.guild.id, current])
    const parentId = pr[0]?.parent_role_id
    if (!parentId) break
    await member.fetch()
    const { rows: siblings } = await pool.query(
      'SELECT role_id FROM dc_guild_roles WHERE guild_id = $1 AND parent_role_id = $2',
      [member.guild.id, parentId])
    const stillHas = siblings.some(s => s.role_id !== current && member.roles.cache.has(s.role_id))
    if (stillHas) break
    if (member.roles.cache.has(parentId)) {
      await member.roles.remove(parentId)
      parentsRemoved.push(parentId)
    }
    current = parentId
  }
  return parentsRemoved
}

module.exports = {
  syncGuildRolesCatalog, upsertGuildRole, deleteGuildRole,
  getPickerRoles, getPickerGroup,
  getRoleIdByName, invalidateGuildRoleCache, getRolesByScopePrefix,
  addRoleWithParents, removeRoleWithParents,
}
