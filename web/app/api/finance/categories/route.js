import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategories, getCategoriesAll, createCategory } from '@/db/finance/categories.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { isAdmin } from '@/lib/roles.js'
import { can } from '@/lib/permissions.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, access } = await getEffectiveIdentity(session)
  const ORG_ID = await getOrgId(session)

  const rows = isAdmin(access)
    ? await getCategoriesAll(ORG_ID)
    : await getCategories(ORG_ID, userId)

  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, access } = await getEffectiveIdentity(session)
  const ORG_ID = await getOrgId(session)

  const { name, icon, is_global } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })
  if (is_global && !can('editGlobalCategory', access.permissions))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const id = await createCategory(ORG_ID, userId ?? session.user.userId, name.trim(), icon || null, !!is_global)
  return Response.json({ id }, { status: 201 })
}
