import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategoryById, updateCategory, deleteCategory } from '@/db/finance/categories.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { isAdmin } from '@/lib/roles.js'
import { can } from '@/lib/permissions.js'

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: rawId } = await params
  const id  = parseInt(rawId)
  const cat = await getCategoryById(id)
  if (!cat) return Response.json({ error: 'Not found' }, { status: 404 })

  const { userId, access } = await getEffectiveOrgIdentity(session)
  const admin = isAdmin(access)

  if (cat.is_global && !can('editGlobalCategory', access.permissions))
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (!cat.is_global && !admin && cat.owner_id !== userId)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { name, icon, is_global } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })
  if (is_global && !can('editGlobalCategory', access.permissions))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  await updateCategory(id, name.trim(), icon || null, !!is_global, session.user.userId)
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: rawId } = await params
  const id  = parseInt(rawId)
  const cat = await getCategoryById(id)
  if (!cat) return Response.json({ error: 'Not found' }, { status: 404 })

  const { userId, access } = await getEffectiveOrgIdentity(session)
  const admin = isAdmin(access)

  if (cat.is_global && !can('editGlobalCategory', access.permissions))
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (!cat.is_global && !admin && cat.owner_id !== userId)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  await deleteCategory(id)
  return Response.json({ ok: true })
}
