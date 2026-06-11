import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'

/**
 * GET /api/me/access — access ของผู้ใช้ปัจจุบัน (debug-aware) สำหรับ client
 * client (useEffectiveRoles) แตะ DB ตรงไม่ได้ จึงดึงผ่าน endpoint นี้
 * permissions ส่งเป็น array เพราะ Set ข้าม JSON ไม่ได้ — normalizeAccess แปลงกลับเป็น Set ฝั่ง client
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles, discordId, access } = await getEffectiveIdentity(session)
  return Response.json({
    roles,
    discordId,
    access: {
      isMember: access.isMember,
      permissions: Array.from(access.permissions),
      scopeGrants: access.scopeGrants,
    },
  })
}
