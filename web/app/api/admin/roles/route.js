import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { can } from '@/lib/permissions.js'
import { clearAccessCache } from '@/lib/resolveAccess.js'
import { addGuildRole, removeGuildRole } from '@/lib/discordRoles.js'
import { logAction } from '@/db/auditLog.js'
import pool from '@/db/index.js'

/**
 * จัดการ role ผ่านเว็บ (Discord = source of truth)
 * gate = manageRoles (admin/moderator) · grantable = role ที่มี permission ยกเว้น admin
 *
 *  GET    ?q=...            → ค้นหาสมาชิก (name/discord_id) + role ปัจจุบัน + catalog role ที่ตั้งได้
 *  POST   {discordId,roleId} → เพิ่ม role (Discord PUT → write-through dc_members.roles → clear cache)
 *  DELETE {discordId,roleId} → ถอด role
 */

async function gate() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Forbidden', status: 403 }
  const { access, discordId } = await getEffectiveIdentity(session)
  if (!can('manageRoles', access.permissions)) return { error: 'Forbidden', status: 403 }
  const guildId = await getGuildId(session)
  return { actorId: discordId, guildId }
}

export async function GET(req) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()

  // catalog: role ที่ตั้งผ่านเว็บได้ (มี permission, ยกเว้น admin)
  const { rows: cat } = await pool.query(
    `SELECT role_id, role_name, permission FROM dc_guild_roles
     WHERE guild_id = $1 AND permission IS NOT NULL AND permission <> 'admin'
     ORDER BY role_name`,
    [g.guildId],
  )
  const assignable = cat.map(c => ({ roleId: c.role_id, roleName: c.role_name, permission: c.permission }))

  let members = []
  if (q.length >= 2) {
    const { rows } = await pool.query(
      `SELECT id, discord_id, username, roles FROM dc_members
       WHERE guild_id = $1 AND discord_id IS NOT NULL
         AND (username ILIKE $2 OR discord_id = $3)
       ORDER BY username LIMIT 20`,
      [g.guildId, `%${q}%`, q],
    )
    members = rows.map(r => ({
      id: r.id,
      discordId: r.discord_id,
      username: r.username,
      roles: r.roles ? r.roles.split(',').map(s => s.trim()).filter(Boolean) : [],
    }))
  }

  return Response.json({ members, assignable })
}

export async function POST(req) { return mutate(req, 'add') }
export async function DELETE(req) { return mutate(req, 'remove') }

async function mutate(req, mode) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { discordId, roleId } = await req.json().catch(() => ({}))
  if (!discordId || !roleId) return Response.json({ error: 'ต้องระบุ discordId และ roleId' }, { status: 400 })

  // validate: roleId ต้องเป็น grantable role ของ guild นี้ (มี permission, ไม่ใช่ admin)
  const { rows } = await pool.query(
    `SELECT role_name, permission FROM dc_guild_roles WHERE guild_id = $1 AND role_id = $2`,
    [g.guildId, roleId],
  )
  const role = rows[0]
  if (!role || !role.permission || role.permission === 'admin')
    return Response.json({ error: 'role นี้ตั้งผ่านเว็บไม่ได้' }, { status: 400 })

  // 1. Discord = source of truth
  const ok = mode === 'add'
    ? await addGuildRole(g.guildId, discordId, roleId)
    : await removeGuildRole(g.guildId, discordId, roleId)
  if (!ok) return Response.json({ error: 'สั่ง Discord ไม่สำเร็จ (เช็คสิทธิ์ bot / ลำดับ role)' }, { status: 502 })

  // 2. write-through dc_members.roles — ให้เว็บเห็นทันที ไม่ต้องรอ Discord sync
  const { rows: mrows } = await pool.query(
    `SELECT roles FROM dc_members WHERE guild_id = $1 AND discord_id = $2`,
    [g.guildId, discordId],
  )
  const cur = mrows[0]?.roles ? mrows[0].roles.split(',').map(s => s.trim()).filter(Boolean) : []
  const set = new Set(cur)
  if (mode === 'add') set.add(role.role_name)
  else set.delete(role.role_name)
  await pool.query(
    `UPDATE dc_members SET roles = $1, updated_at = CURRENT_TIMESTAMP WHERE guild_id = $2 AND discord_id = $3`,
    [Array.from(set).join(','), g.guildId, discordId],
  )

  // 3. invalidate access cache (resolveAccess) + audit
  clearAccessCache(g.guildId)
  logAction({
    guildId: g.guildId,
    app: 'admin',
    action: mode === 'add' ? 'role_grant' : 'role_revoke',
    actorId: g.actorId,
    targetId: discordId,
    meta: { role_name: role.role_name, permission: role.permission },
  })

  return Response.json({ ok: true })
}
