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
 * จัดการ role ผ่านเว็บ — ครอบทั้งคน Discord และคน email (Discord = source of truth ของคน Discord)
 * gate = manageRoles (admin/moderator) · grantable = role ที่มี permission ยกเว้น admin
 *
 *  GET    ?q=...            → ค้นสมาชิก (Discord ของ guild + email ของ org) + catalog role ที่ตั้งได้
 *  POST   {memberId,roleId} → เพิ่ม role · DELETE {memberId,roleId} → ถอด
 *    - คน Discord (มี discord_id) → สั่ง Discord PUT/DELETE + write-through org_members.roles (ชื่อ)
 *    - คน email  (discord_id NULL) → org_members.web_roles (key จาก org_roles)
 */

async function gate() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Forbidden', status: 403 }
  const { access, discordId } = await getEffectiveIdentity(session)
  if (!can('manageRoles', access.permissions)) return { error: 'Forbidden', status: 403 }
  const guildId = await getGuildId(session)
  const { rows } = await pool.query('SELECT org_id FROM dc_guilds WHERE guild_id = $1', [guildId])
  return { actorId: discordId, guildId, orgId: rows[0]?.org_id ?? null }
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
    const like = `%${q}%`
    // identity = users · roles/web_roles = org_members (per membership: guild สำหรับ Discord, org สำหรับ email)
    const { rows } = await pool.query(
      `SELECT u.id, u.discord_id, u.username, u.email, om.roles, om.web_roles
       FROM org_members om
       JOIN users u ON u.id = om.user_id
       WHERE ( (om.guild_id = $1 AND u.discord_id IS NOT NULL)                 -- คน Discord ของ guild นี้
            OR (u.discord_id IS NULL AND om.org_id = $4 AND om.guild_id IS NULL) )  -- คน email ของ org นี้
         AND (u.username ILIKE $2 OR u.email ILIKE $2 OR u.discord_id = $3)
       ORDER BY u.username
       LIMIT 20`,
      [g.guildId, like, q, g.orgId],
    )
    members = rows.map(r => ({
      id: r.id,
      type: r.discord_id ? 'discord' : 'email',
      discordId: r.discord_id,
      label: r.username || r.email || `#${r.id}`,
      roles: r.roles ? r.roles.split(',').map(s => s.trim()).filter(Boolean) : [],
      webRoles: r.web_roles ? r.web_roles.split(',').map(s => s.trim()).filter(Boolean) : [],
    }))
  }

  return Response.json({ members, assignable })
}

export async function POST(req) { return mutate(req, 'add') }
export async function DELETE(req) { return mutate(req, 'remove') }

async function mutate(req, mode) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { memberId, roleId } = await req.json().catch(() => ({}))
  if (!memberId || !roleId) return Response.json({ error: 'ต้องระบุ memberId และ roleId' }, { status: 400 })

  // validate: roleId ต้องเป็น grantable role ของ guild นี้ (มี permission, ไม่ใช่ admin)
  const { rows: rr } = await pool.query(
    `SELECT role_name, permission FROM dc_guild_roles WHERE guild_id = $1 AND role_id = $2`,
    [g.guildId, roleId],
  )
  const role = rr[0]
  if (!role || !role.permission || role.permission === 'admin')
    return Response.json({ error: 'role นี้ตั้งผ่านเว็บไม่ได้' }, { status: 400 })

  // identity = users.id · roles/web_roles = org_members row ที่ตรง membership (guild สำหรับ Discord, org สำหรับ email)
  const { rows: mr } = await pool.query(
    `SELECT u.id, u.discord_id, om.guild_id, om.roles, om.web_roles
     FROM users u
     LEFT JOIN org_members om ON om.user_id = u.id
          AND ( (u.discord_id IS NOT NULL AND om.guild_id = $2)
             OR (u.discord_id IS NULL AND om.org_id = $3 AND om.guild_id IS NULL) )
     WHERE u.id = $1`,
    [memberId, g.guildId, g.orgId],
  )
  const member = mr[0]
  if (!member) return Response.json({ error: 'ไม่พบสมาชิก' }, { status: 404 })

  if (member.discord_id) {
    // ── คน Discord: Discord = source of truth ──
    const ok = mode === 'add'
      ? await addGuildRole(member.guild_id || g.guildId, member.discord_id, roleId)
      : await removeGuildRole(member.guild_id || g.guildId, member.discord_id, roleId)
    if (!ok) return Response.json({ error: 'สั่ง Discord ไม่สำเร็จ (เช็คสิทธิ์ bot / ลำดับ role)' }, { status: 502 })

    // write-through org_members.roles (ชื่อ Discord) — เห็นทันทีไม่รอ sync
    const cur = member.roles ? member.roles.split(',').map(s => s.trim()).filter(Boolean) : []
    const set = new Set(cur)
    if (mode === 'add') set.add(role.role_name); else set.delete(role.role_name)
    await pool.query(
      `UPDATE org_members SET roles = $1, roles_assigned_at = NOW() WHERE user_id = $2 AND guild_id = $3`,
      [Array.from(set).join(','), member.id, member.guild_id || g.guildId],
    )
  } else {
    // ── คน email: web_roles (key จาก org_roles) — org_members row (guild_id NULL) ──
    const cur = member.web_roles ? member.web_roles.split(',').map(s => s.trim()).filter(Boolean) : []
    const set = new Set(cur)
    if (mode === 'add') set.add(role.permission); else set.delete(role.permission)
    await pool.query(
      `UPDATE org_members SET web_roles = $1, roles_assigned_at = NOW()
       WHERE user_id = $2 AND org_id = $3 AND guild_id IS NULL`,
      [Array.from(set).join(','), member.id, g.orgId],
    )
  }

  clearAccessCache(g.guildId)
  logAction({
    guildId: g.guildId,
    app: 'admin',
    action: mode === 'add' ? 'role_grant' : 'role_revoke',
    actorId: g.actorId,
    targetId: member.discord_id || `u${member.id}`,
    meta: { role_name: role.role_name, permission: role.permission, via: member.discord_id ? 'discord' : 'web' },
  })

  return Response.json({ ok: true })
}
