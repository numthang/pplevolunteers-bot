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
  INSERT INTO dc_guild_roles (guild_id, role_id, role_name)
  VALUES ($1, $2, $3)
  ON CONFLICT (guild_id, role_id) DO UPDATE SET
    role_name = EXCLUDED.role_name,
    updated_at = CURRENT_TIMESTAMP`

/** upsert ทุก role ของ guild — คืนจำนวน role ที่ sync */
async function syncGuildRolesCatalog(guild) {
  const roles = guild.roles.cache.filter(r => r.name !== '@everyone')
  let count = 0
  for (const role of roles.values()) {
    await pool.query(UPSERT_SQL, [guild.id, role.id, role.name])
    count++
  }
  return count
}

/** upsert role เดียว (event roleCreate / roleUpdate) */
async function upsertGuildRole(role) {
  if (!role || role.name === '@everyone') return
  await pool.query(UPSERT_SQL, [role.guild.id, role.id, role.name])
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

module.exports = {
  syncGuildRolesCatalog, upsertGuildRole, deleteGuildRole,
  getPickerRoles, getPickerGroup,
}
