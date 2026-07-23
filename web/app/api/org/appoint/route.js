import { getOrgSession } from '@/lib/orgAuth.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { getAppointPolicy } from '@/db/orgConfig.js'
import { canAppoint } from '@/lib/permissions.js'
import { clearAccessCache } from '@/lib/resolveAccess.js'
import { addGuildRole, removeGuildRole } from '@/lib/discordRoles.js'
import { logAction } from '@/db/auditLog.js'
import {
  grantWebRole, revokeWebRole, getMemberPermissions,
  listDiscordRoleTargets, setRolesCopy, resyncDiscordRolesForUser,
} from '@/db/orgMemberRoles.js'
import pool from '@/db/index.js'

/**
 * แต่งตั้งยศ (permission role) ระดับ org — org-native (ใช้ได้กับ guildless org)
 *  GATE  = owner (เสมอ) หรือ permission ∈ org_config.appoint_policy   → getEffectiveOrgIdentity
 *  FLOOR = capability-subset (canAppoint) — แต่งตั้งไม่เกินอำนาจตัวเอง · admin ห้าม web-grant
 *
 * ⚠️ ขั้น 5 (2026-07-22) — เว็บเป็นแหล่งความจริง เขียนลง `org_member_roles` เสมอ
 *    ไม่ว่า target จะมี Discord หรือไม่ · Discord = กระจกเงา ซิงค์ตามแบบ best-effort
 *    เดิมเลือก guild ให้เองแบบเดา (DISTINCT ON ... ORDER BY guild_id) แล้วต้องมียศ
 *    Discord รองรับก่อนถึงจะแต่งตั้งได้ → ทั้งสองอย่างหายไปแล้ว ตำแหน่งผูกกับ org
 *
 *    ตอนถอด **ต้องถอดยศ Discord ด้วย** ทุก guild ที่แมปสิทธิ์นี้ไว้ ไม่งั้นการซิงค์
 *    รอบหน้าจะคืนสิทธิ์กลับมาเงียบๆ (source='discord' เป็นคนละแถวกับ source='web')
 *
 *  GET    ?q=...              → ค้นสมาชิก + catalog (org_roles ตัด admin + canGrant/floor)
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
              om.role AS membership_role
         FROM org_members om JOIN users u ON u.id = om.user_id
        WHERE om.org_id = $1
          AND (u.username ILIKE $2 OR u.email ILIKE $2 OR u.discord_id = $3)
        ORDER BY u.id, (om.role = 'owner') DESC, om.guild_id NULLS LAST
        LIMIT 20`,
      [g.orgId, like, q]
    )
    members = await Promise.all(rows.map(async r => {
      // สิทธิ์ที่ถืออยู่จริง = org_member_roles ที่เดียว (ไม่ต้องแปลจากยศ Discord ต่อ guild อีก)
      const held = await getMemberPermissions(g.orgId, r.id)
      const permissions = [...new Set(held.map(x => x.permission))]
      // สิทธิ์ที่มาจาก Discord อย่างเดียว = ถอดจากเว็บได้ แต่ต้องถอดยศใน Discord ตาม
      const fromDiscord = [...new Set(held.filter(x => x.source === 'discord').map(x => x.permission))]
      return {
        fromDiscord,
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

  // target = user ที่เป็นสมาชิก org นี้ (ไม่ต้องเลือก guild — ตำแหน่งผูกกับ org)
  const { rows: mr } = await pool.query(
    `SELECT u.id, u.discord_id FROM users u
      WHERE u.id = $1 AND EXISTS (SELECT 1 FROM org_members om WHERE om.user_id = u.id AND om.org_id = $2)`,
    [memberId, g.orgId]
  )
  const m = mr[0]
  if (!m) return Response.json({ error: 'ไม่พบสมาชิกใน org นี้' }, { status: 404 })

  // ── 1. แหล่งความจริง: org_member_roles (source='web') ──
  if (mode === 'add') await grantWebRole(g.orgId, m.id, roleKey, g.actorUserId)
  else await revokeWebRole(g.orgId, m.id, roleKey)

  // ── 2. กระจกเงา Discord: ทุก guild ของ user ที่แมปสิทธิ์นี้ไว้ ──
  //    add = best-effort (พลาดก็ยังมีสิทธิ์จากข้อ 1)
  //    remove = จำเป็น ถ้าพลาดต้องบอก ไม่งั้นซิงค์รอบหน้าคืนสิทธิ์กลับมา
  const failed = []
  if (m.discord_id) {
    const targets = await listDiscordRoleTargets(g.orgId, m.id, roleKey)
    for (const t of targets) {
      const ok = mode === 'add'
        ? await addGuildRole(t.guild_id, m.discord_id, t.role_id)
        : await removeGuildRole(t.guild_id, m.discord_id, t.role_id)
      if (!ok) { failed.push(t.guild_id); continue }
      await setRolesCopy(m.id, t.guild_id, t.role_name, mode)
      clearAccessCache(t.guild_id)
    }
    await resyncDiscordRolesForUser(m.id)
  }

  logAction({
    orgId: g.orgId,
    app: 'org',
    action: mode === 'add' ? 'role_grant' : 'role_revoke',
    actorId: g.actorUserId,
    targetId: m.discord_id || `u${m.id}`,
    meta: { roleKey, discordFailed: failed.length ? failed : undefined },
  })

  if (failed.length && mode === 'remove') {
    return Response.json({
      ok: true,
      warning: `ถอดสิทธิ์ในเว็บแล้ว แต่ถอดยศ Discord ไม่สำเร็จ ${failed.length} เซิร์ฟเวอร์ ` +
               `— สิทธิ์จะกลับมาตอนซิงค์รอบหน้า (เช็คสิทธิ์ bot / ลำดับ role)`,
    })
  }
  return Response.json({ ok: true })
}
