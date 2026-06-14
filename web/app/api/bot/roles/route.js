import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getAdminGuildIds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import { clearAccessCache } from '@/lib/resolveAccess.js'
import { PERMISSIONS } from '@/lib/permissions.js'
import pool from '@/db/index.js'

const SCOPE_PREFIXES = ['province', 'subregion', 'region']

// policy fields ที่ admin แก้ได้ (role_id/role_name ไม่ใช่ — bot sync เอง)
const NULLABLE_TEXT = ['permission', 'scope_node', 'picker_group', 'picker_label', 'picker_emoji', 'parent_role_id']

async function authGuildAdmin(session, guildId) {
  if (isSuperAdmin(session.user.discordId)) return true
  const { access } = await getEffectiveIdentity(session)
  if (!isAdmin(access)) return false
  const adminGuildIds = await getAdminGuildIds(session.user.discordId)
  return adminGuildIds.includes(guildId)
}

// GET → { guildId, roles, groups, permissions, scopePrefixes }
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!(await authGuildAdmin(session, guildId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [rolesRes, groupsRes] = await Promise.all([
    pool.query(
      `SELECT role_id, role_name, permission, scope_node,
              picker_group, picker_label, picker_emoji, picker_order, parent_role_id
       FROM dc_guild_roles WHERE guild_id = $1 AND is_managed = FALSE
       ORDER BY
         CASE WHEN permission IS NOT NULL OR scope_node IS NOT NULL
                   OR picker_group IS NOT NULL OR parent_role_id IS NOT NULL
              THEN 0 ELSE 1 END,
         role_name`,
      [guildId]
    ),
    pool.query(
      `SELECT group_key, label, kind FROM dc_guild_role_groups WHERE guild_id = $1 ORDER BY sort_order`,
      [guildId]
    ),
  ])

  return Response.json({
    guildId,
    roles: rolesRes.rows,
    groups: groupsRes.rows,
    permissions: PERMISSIONS,
    scopePrefixes: SCOPE_PREFIXES,
  })
}

// PATCH { role_id, permission?, scope_node?, picker_group?, picker_label?, picker_emoji?, picker_order?, parent_role_id? }
//   ส่ง field ไหนมา = อัปเดต field นั้น (null/'' = ล้างค่า) · ไม่ส่ง = ไม่แตะ
export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!(await authGuildAdmin(session, guildId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { role_id } = body
  if (!role_id) return Response.json({ error: 'role_id required' }, { status: 400 })

  // validate ค่าที่ส่งมา
  if ('permission' in body && body.permission && !PERMISSIONS.includes(body.permission)) {
    return Response.json({ error: 'invalid permission' }, { status: 400 })
  }
  if ('scope_node' in body && body.scope_node) {
    const prefix = String(body.scope_node).split(':')[0]
    if (!SCOPE_PREFIXES.includes(prefix)) {
      return Response.json({ error: 'invalid scope_node prefix' }, { status: 400 })
    }
  }
  if ('picker_group' in body && body.picker_group) {
    const { rows } = await pool.query(
      `SELECT 1 FROM dc_guild_role_groups WHERE guild_id = $1 AND group_key = $2`,
      [guildId, body.picker_group]
    )
    if (!rows.length) return Response.json({ error: 'unknown picker_group' }, { status: 400 })
  }

  // build SET clause เฉพาะ field ที่ส่งมา
  const sets = []
  const vals = []
  let i = 1
  for (const f of NULLABLE_TEXT) {
    if (f in body) {
      sets.push(`${f} = $${i++}`)
      vals.push(body[f] === '' ? null : body[f])
    }
  }
  if ('picker_order' in body) {
    sets.push(`picker_order = $${i++}`)
    vals.push(body.picker_order === '' || body.picker_order == null ? null : Number(body.picker_order))
  }
  if (!sets.length) return Response.json({ error: 'no fields to update' }, { status: 400 })

  sets.push(`updated_at = CURRENT_TIMESTAMP`)
  vals.push(guildId, role_id)
  const { rowCount } = await pool.query(
    `UPDATE dc_guild_roles SET ${sets.join(', ')} WHERE guild_id = $${i++} AND role_id = $${i}`,
    vals
  )
  if (!rowCount) return Response.json({ error: 'role not found' }, { status: 404 })

  clearAccessCache(guildId) // ให้ permission/scope ใหม่มีผลทันที (ไม่ต้องรอ cache TTL)
  return Response.json({ ok: true })
}
