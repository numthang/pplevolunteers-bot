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

module.exports = { syncGuildRolesCatalog, upsertGuildRole, deleteGuildRole }
