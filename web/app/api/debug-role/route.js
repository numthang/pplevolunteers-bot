import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { cookies } from 'next/headers'
import { isAdmin, isSuperAdmin } from '@/lib/roles.js'
import { getRealAccess } from '@/lib/getEffectiveRoles.js'

const COOKIE_OPTS = { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 }

// ใครเปิด/ปิด debug ได้: superadmin (env, ทุก guild) หรือ admin จริงของ guild ปัจจุบัน
// superadmin escape สำคัญ — กันค้างเมื่อ view guild ที่ตัวเองไม่ได้เป็น role-admin
async function canDebug(session) {
  if (isSuperAdmin(session.user.discordId)) return true
  return isAdmin(await getRealAccess(session))
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canDebug(session))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const cookieStore = await cookies()

  if (body.discordId) {
    // impersonate mode
    cookieStore.set('debug_discord_id', body.discordId, COOKIE_OPTS)
    cookieStore.set('debug_discord_name', body.displayName || body.discordId, COOKIE_OPTS)
    cookieStore.set('debug_discord_roles', body.roles || '', COOKIE_OPTS)
    cookieStore.set('debug_role', '', { maxAge: 0, path: '/' })
  } else {
    // combo mode
    cookieStore.set('debug_role', body.role, COOKIE_OPTS)
    cookieStore.set('debug_discord_id', '', { maxAge: 0, path: '/' })
    cookieStore.set('debug_discord_name', '', { maxAge: 0, path: '/' })
    cookieStore.set('debug_discord_roles', '', { maxAge: 0, path: '/' })
  }

  return Response.json({ ok: true })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session || !(await canDebug(session))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set('debug_role', '', { maxAge: 0, path: '/' })
  cookieStore.set('debug_discord_id', '', { maxAge: 0, path: '/' })
  cookieStore.set('debug_discord_name', '', { maxAge: 0, path: '/' })
  cookieStore.set('debug_discord_roles', '', { maxAge: 0, path: '/' })

  return Response.json({ ok: true })
}
