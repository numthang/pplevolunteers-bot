import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategories, getCategoriesAll, createCategory } from '@/db/finance/categories.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { isAdmin } from '@/lib/roles.js'
import { can } from '@/lib/permissions.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { discordId, access } = await getEffectiveIdentity(session)
  const GUILD_ID = await getGuildId(session)

  const rows = isAdmin(access)
    ? await getCategoriesAll(GUILD_ID)
    : await getCategories(GUILD_ID, discordId)

  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { discordId, access } = await getEffectiveIdentity(session)
  const GUILD_ID = await getGuildId(session)

  const { name, icon, is_global } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })
  if (is_global && !can('editGlobalCategory', access.permissions))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const id = await createCategory(GUILD_ID, discordId ?? session.user.discordId, name.trim(), icon || null, !!is_global)
  return Response.json({ id }, { status: 201 })
}
