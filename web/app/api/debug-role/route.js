import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { cookies } from 'next/headers'
import { isAdmin } from '@/lib/roles.js'

const COOKIE_OPTS = { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8 }

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
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
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set('debug_role', '', { maxAge: 0, path: '/' })
  cookieStore.set('debug_discord_id', '', { maxAge: 0, path: '/' })
  cookieStore.set('debug_discord_name', '', { maxAge: 0, path: '/' })
  cookieStore.set('debug_discord_roles', '', { maxAge: 0, path: '/' })

  return Response.json({ ok: true })
}
