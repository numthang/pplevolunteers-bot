import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { cookies } from 'next/headers'
import { isGuildMember } from '@/db/guilds.js'
import { SELECTED_GUILD_COOKIE } from '@/lib/guildContext.js'

const COOKIE_OPTS = { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 }

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { guildId } = await req.json()
  if (!guildId) {
    return Response.json({ error: 'guildId is required' }, { status: 400 })
  }

  // gate: ต้องเป็น member ของ guild นั้นจริง — กันสลับไป guild ที่ไม่ได้เป็นสมาชิก
  const ok = await isGuildMember(session.user.discordId, guildId)
  if (!ok) {
    return Response.json({ error: 'Forbidden: not a member of this guild' }, { status: 403 })
  }

  const cookieStore = await cookies()
  cookieStore.set(SELECTED_GUILD_COOKIE, guildId, COOKIE_OPTS)

  return Response.json({ ok: true })
}
