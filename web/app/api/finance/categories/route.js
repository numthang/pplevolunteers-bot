import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategories, getCategoriesAll, createCategory } from '@/db/finance/categories.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'

const GUILD_ID = process.env.GUILD_ID
const ADMIN_ROLES    = ['Admin', 'เลขาธิการ']
const GLOBAL_EDITORS = ['Admin', 'เลขาธิการ', 'Moderator']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles, discordId } = await getEffectiveIdentity(session)
  const isAdmin = ADMIN_ROLES.some(r => roles.includes(r))

  const rows = isAdmin
    ? await getCategoriesAll(GUILD_ID)
    : await getCategories(GUILD_ID, discordId)

  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles, discordId } = await getEffectiveIdentity(session)

  const { name, icon, is_global } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })
  if (is_global && !GLOBAL_EDITORS.some(r => roles.includes(r)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const id = await createCategory(GUILD_ID, discordId ?? session.user.discordId, name.trim(), icon || null, !!is_global)
  return Response.json({ id }, { status: 201 })
}
