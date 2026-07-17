// web/lib/orgAccess.js — org-keyed identity/access (finance-first)
//
// สิทธิ์ระดับ org = union roles+web_roles ของทุกแถว org_members ใน org นั้น (ข้ามทุก guild)
// เหตุ: data finance เป็น org-wide แล้ว → access ต้อง org-wide ให้ coherent
//   (ไม่งั้นเหรัญญิกของ guild เดียว เห็นเงิน org แต่จัดการไม่ได้)
// verify blast radius: 0 elevation (finance authority กระจุกที่ guild หลักมาตลอด)
//
// debug/view-as-role → delegate path เดิม (guild-based, admin testing tool)
// guildless org → resolveAccess(null,...) คืน permission จาก web_roles ล้วน (dc_guild_roles ว่าง)
import { cookies } from 'next/headers'
import pool from '@/db/index.js'
import { resolveAccess } from './resolveAccess.js'
import { getOrgId } from './orgContext.js'
import { getEffectiveIdentity } from './getEffectiveRoles.js'

export async function getEffectiveOrgIdentity(session) {
  const jar = await cookies()
  if (jar.get('debug_discord_id') || jar.get('debug_role')) {
    return getEffectiveIdentity(session)   // debug = guild-based ตามเดิม
  }

  const userId = session?.user?.userId || null
  const discordId = session?.user?.discordId || null
  const emptyAccess = { isMember: false, permissions: new Set(), scopeGrants: [] }
  if (!userId) return { roles: [], discordId, userId, access: emptyAccess }

  const orgId = await getOrgId(session)
  if (!orgId) return { roles: [], discordId, userId, access: emptyAccess }

  const { rows } = await pool.query(
    `SELECT om.guild_id, om.roles, om.web_roles
       FROM org_members om
      WHERE om.org_id = $1 AND om.user_id = $2`,
    [orgId, userId]
  )

  const permissions = new Set()
  const scopeGrants = []
  let isMember = false
  for (const r of rows) {
    isMember = true
    const roles = (r.roles || '').split(',').map(s => s.trim()).filter(Boolean)
    const webRoles = (r.web_roles || '').split(',').map(s => s.trim()).filter(Boolean)
    const a = await resolveAccess(r.guild_id, roles, webRoles)
    for (const p of a.permissions) permissions.add(p)
    for (const g of a.scopeGrants) scopeGrants.push(g)
  }
  return { roles: [], discordId, userId, access: { isMember, permissions, scopeGrants } }
}
