import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity, getRealAccess } from '@/lib/getEffectiveRoles.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { isAdmin, isSuperAdmin } from '@/lib/roles.js'

/**
 * GET /api/me/access — access ของผู้ใช้ปัจจุบัน (debug-aware) สำหรับ client
 * client (useEffectiveRoles) แตะ DB ตรงไม่ได้ จึงดึงผ่าน endpoint นี้
 * permissions ส่งเป็น array เพราะ Set ข้าม JSON ไม่ได้ — normalizeAccess แปลงกลับเป็น Set ฝั่ง client
 * realAdmin = admin จริง (ไม่ผ่าน debug) — ใช้คุมปุ่ม/banner debug ไม่ให้ admin ติดกับใน debug mode
 *
 * ?scope=org → access แบบ org-keyed (union ทุก guild ใน org, รองรับ guildless org) สำหรับ finance
 *   feature ที่ยัง guild-based (calling/docs/cases/bot) เรียกแบบไม่มี scope → guild-based ตามเดิม
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const scope = new URL(req.url).searchParams.get('scope')
  const { roles, discordId, access } = scope === 'org'
    ? await getEffectiveOrgIdentity(session)
    : await getEffectiveIdentity(session)
  const realAdmin = isAdmin(await getRealAccess(session))
  // effective discordId เป็น null ตอน debug combo → isSuperAdmin(null)=false → debug หลุด super
  const superAdmin = isSuperAdmin(discordId)
  return Response.json({
    roles,
    discordId,
    realAdmin,
    superAdmin,
    access: {
      isMember: access.isMember,
      permissions: Array.from(access.permissions),
      scopeGrants: access.scopeGrants,
    },
  })
}
