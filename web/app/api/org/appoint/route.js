import { getOrgSession } from '@/lib/orgAuth.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { getAppointPolicy } from '@/db/orgConfig.js'
import { canAppoint } from '@/lib/permissions.js'
import { clearAccessCache } from '@/lib/resolveAccess.js'
import { addGuildRole, removeGuildRole } from '@/lib/discordRoles.js'
import { logAction } from '@/db/auditLog.js'
import pool from '@/db/index.js'

/**
 * แต่งตั้งยศ (permission role) ระดับ org — org-native (ใช้ได้กับ guildless org)
 *  GATE  = owner (เสมอ) หรือ permission ∈ org_config.appoint_policy   → getEffectiveOrgIdentity
 *  FLOOR = capability-subset (canAppoint) — แต่งตั้งไม่เกินอำนาจตัวเอง · admin ห้าม web-grant
 *  target Discord → สั่ง Discord role จริง + write-through org_members.roles (ชื่อ)
 *  target email   → org_members.web_roles (permission key)
 *
 *  GET    ?q=...              → ค้นสมาชิก (dedup per-guild) + catalog (org_roles ตัด admin + canGrant/floor)
 *  POST   {memberId,roleKey}  → แต่งตั้ง · DELETE {memberId,roleKey} → ถอด
 */

async function gate() {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = await getOrgId(session)
  if (!orgId) return { error: 'ไม่มี org ที่เลือกอยู่', status: 400 }

  const [{ access }, membership, policy] = await Promise.all([
    getEffectiveOrgIdentity(session),
    getOrgMembership(orgId, userId),
    getAppointPolicy(orgId),
  ])
  const isOwner = membership?.role === 'owner' && membership.status === 'active'
  // owner + admin (god-mode) แต่งตั้งได้เสมอ · นอกนั้นตาม appoint_policy ต่อ org
  const canUse = isOwner || access.permissions.has('admin') || policy.some(p => access.permissions.has(p))
  if (!canUse) return { error: 'forbidden', status: 403 }

  return { orgId, perms: access.permissions, actorUserId: session.user.userId }
}

export async function GET(req) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const q = (new URL(req.url).searchParams.get('q') || '').trim()

  // catalog = org_roles active, ตัด admin · canGrant = floor ต่อผู้แต่งตั้งคนนี้
  const { rows: roleRows } = await pool.query(
    `SELECT key, label_th, category FROM org_roles WHERE is_active AND key <> 'admin' ORDER BY sort_order`
  )
  const catalog = roleRows.map(r => ({
    key: r.key, label: r.label_th, category: r.category, canGrant: canAppoint(g.perms, r.key),
  }))

  let members = []
  if (q.length >= 2) {
    const like = `%${q}%`
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (u.id)
              u.id, u.discord_id, u.username, u.email,
              om.guild_id, om.role AS membership_role, om.roles, om.web_roles
         FROM org_members om JOIN users u ON u.id = om.user_id
        WHERE om.org_id = $1
          AND (u.username ILIKE $2 OR u.email ILIKE $2 OR u.discord_id = $3)
        ORDER BY u.id, (om.role = 'owner') DESC, om.guild_id NULLS LAST
        LIMIT 20`,
      [g.orgId, like, q]
    )
    members = await Promise.all(rows.map(async r => {
      // permission keys ที่ถืออยู่ตอนนี้: Discord = map role_name→permission (guild) · email = web_roles ตรงๆ
      let permissions = []
      if (r.discord_id) {
        const names = (r.roles || '').split(',').map(s => s.trim()).filter(Boolean)
        if (names.length && r.guild_id) {
          const { rows: pm } = await pool.query(
            `SELECT DISTINCT permission FROM dc_guild_roles
              WHERE guild_id = $1 AND role_name = ANY($2) AND permission IS NOT NULL`,
            [r.guild_id, names]
          )
          permissions = pm.map(x => x.permission)
        }
      } else {
        permissions = (r.web_roles || '').split(',').map(s => s.trim()).filter(Boolean)
      }
      return {
        id: r.id,
        type: r.discord_id ? 'discord' : 'email',
        label: r.username || r.email || `#${r.id}`,
        sub: r.discord_id ? (r.email || 'Discord') : r.email,
        membershipRole: r.membership_role,
        permissions,
      }
    }))
  }

  return Response.json({ members, catalog })
}

export async function POST(req) { return mutate(req, 'add') }
export async function DELETE(req) { return mutate(req, 'remove') }

async function mutate(req, mode) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { memberId, roleKey } = await req.json().catch(() => ({}))
  if (!memberId || !roleKey) return Response.json({ error: 'ต้องระบุ memberId และ roleKey' }, { status: 400 })

  // role ต้อง active + ไม่ใช่ admin
  const { rows: rr } = await pool.query(`SELECT key FROM org_roles WHERE key = $1 AND is_active`, [roleKey])
  if (!rr[0] || roleKey === 'admin')
    return Response.json({ error: 'role นี้แต่งตั้งผ่านเว็บไม่ได้' }, { status: 400 })

  // FLOOR — แต่งตั้งไม่เกินอำนาจตัวเอง
  if (!canAppoint(g.perms, roleKey))
    return Response.json({ error: 'เกินอำนาจแต่งตั้งของคุณ' }, { status: 403 })

  // target row ใน org นี้ (dedup per-guild: prefer owner แล้ว guild ก่อน null)
  const { rows: mr } = await pool.query(
    `SELECT DISTINCT ON (u.id) u.id, u.discord_id, om.guild_id, om.roles, om.web_roles
       FROM users u JOIN org_members om ON om.user_id = u.id
      WHERE u.id = $1 AND om.org_id = $2
      ORDER BY u.id, (om.role = 'owner') DESC, om.guild_id NULLS LAST`,
    [memberId, g.orgId]
  )
  const m = mr[0]
  if (!m) return Response.json({ error: 'ไม่พบสมาชิกใน org นี้' }, { status: 404 })

  if (m.discord_id) {
    // ── Discord target: หา role_id ใน guild ที่ permission ตรง แล้วสั่ง Discord จริง ──
    const { rows: dr } = await pool.query(
      `SELECT role_id, role_name FROM dc_guild_roles WHERE guild_id = $1 AND permission = $2 LIMIT 1`,
      [m.guild_id, roleKey]
    )
    if (!dr[0])
      return Response.json({ error: 'guild นี้ยังไม่มี Discord role สำหรับสิทธิ์นี้ (สร้าง+map ก่อน)' }, { status: 400 })

    const ok = mode === 'add'
      ? await addGuildRole(m.guild_id, m.discord_id, dr[0].role_id)
      : await removeGuildRole(m.guild_id, m.discord_id, dr[0].role_id)
    if (!ok) return Response.json({ error: 'สั่ง Discord ไม่สำเร็จ (เช็คสิทธิ์ bot / ลำดับ role)' }, { status: 502 })

    const cur = (m.roles || '').split(',').map(s => s.trim()).filter(Boolean)
    const set = new Set(cur)
    if (mode === 'add') set.add(dr[0].role_name); else set.delete(dr[0].role_name)
    await pool.query(
      `UPDATE org_members SET roles = $1, roles_assigned_at = NOW() WHERE user_id = $2 AND guild_id = $3`,
      [Array.from(set).join(','), m.id, m.guild_id]
    )
  } else {
    // ── email target: web_roles (permission key ตรงๆ) ──
    const cur = (m.web_roles || '').split(',').map(s => s.trim()).filter(Boolean)
    const set = new Set(cur)
    if (mode === 'add') set.add(roleKey); else set.delete(roleKey)
    await pool.query(
      `UPDATE org_members SET web_roles = $1, roles_assigned_at = NOW()
        WHERE user_id = $2 AND org_id = $3 AND guild_id IS NULL`,
      [Array.from(set).join(','), m.id, g.orgId]
    )
  }

  if (m.guild_id) clearAccessCache(m.guild_id)
  logAction({
    orgId: g.orgId,
    app: 'org',
    action: mode === 'add' ? 'role_grant' : 'role_revoke',
    actorId: g.actorUserId,
    targetId: m.discord_id || `u${m.id}`,
    meta: { roleKey, via: m.discord_id ? 'discord' : 'web' },
  })

  return Response.json({ ok: true })
}
