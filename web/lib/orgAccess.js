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
import { resolveAccessV2 } from './resolveAccessV2.js'
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

  // ORG_ACCESS_REDESIGN ขั้น 4 — สิทธิ์มาจาก org_member_roles ที่เดียว (ไม่แตะ dc_guild_roles)
  // เดิมต้อง loop org_members ทีละ guild แล้ว union เอง เพราะ catalog ผูกกับ guild
  const access = await resolveAccessV2(orgId, userId)

  // owner (membership role) = org superuser — คนสร้าง org เอง = เจ้าของสูงสุดใน org นั้น
  // bounded ที่ org ตัวเอง (query filter org_id เดียว) → ไม่ elevate ข้าม org
  const { rows } = await pool.query(
    `SELECT 1 FROM org_members
      WHERE org_id = $1 AND user_id = $2 AND role = 'owner' AND status = 'active' LIMIT 1`,
    [orgId, userId]
  )
  if (rows.length > 0) access.permissions.add('admin')   // god-mode ภายใน org ตัวเอง (Slack/Notion owner model)

  return { roles: [], discordId, userId, access }
}
