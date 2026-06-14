import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin, isSuperAdmin } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuilds, getAdminGuildIds } from '@/db/guilds.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  const admin = isAdmin(access)
  const superAdmin = isSuperAdmin(session.user.discordId)
  if (!admin && !superAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 })

  if (superAdmin) {
    const guilds = await getGuilds()
    return Response.json(guilds)
  }

  const adminGuildIds = await getAdminGuildIds(session.user.discordId)
  const allGuilds = await getGuilds()
  return Response.json(allGuilds.filter(g => adminGuildIds.includes(g.guild_id)))
}
