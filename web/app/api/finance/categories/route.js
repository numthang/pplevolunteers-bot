import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategories, getCategoriesAll, createCategory } from '@/db/finance/categories.js'

const GUILD_ID = process.env.GUILD_ID
const ADMIN_ROLES    = ['Admin', 'รองเลขาธิการ']
const GLOBAL_EDITORS = ['Admin', 'รองเลขาธิการ', 'Moderator']

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const r = session.user.roles
  const roles = Array.isArray(r) ? r : (r || '').split(',').map(x => x.trim())
  const isAdmin = ADMIN_ROLES.some(r => roles.includes(r))

  const rows = isAdmin
    ? await getCategoriesAll(GUILD_ID)
    : await getCategories(GUILD_ID, session.user.discordId)

  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const r = session.user.roles
  const roles = Array.isArray(r) ? r : (r || '').split(',').map(x => x.trim())

  const { name, icon, is_global } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })
  if (is_global && !GLOBAL_EDITORS.some(role => roles.includes(role)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const id = await createCategory(GUILD_ID, session.user.discordId, name.trim(), icon || null, !!is_global)
  return Response.json({ id }, { status: 201 })
}
