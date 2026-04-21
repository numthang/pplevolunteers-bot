import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { cookies } from 'next/headers'
import { isAdmin } from '@/lib/roles.js'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { role } = await req.json()
  const cookieStore = await cookies()
  cookieStore.set('debug_role', role, {
    httpOnly: false,   // client-side JS ต้องอ่านได้
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8   // 8 ชั่วโมง
  })

  return Response.json({ ok: true, role })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set('debug_role', '', { maxAge: 0, path: '/' })

  return Response.json({ ok: true })
}
