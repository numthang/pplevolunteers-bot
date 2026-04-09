import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategoryById, updateCategory, deleteCategory } from '@/db/finance/categories.js'

const ADMIN_ROLES    = ['Admin', 'รองเลขาธิการ']
const GLOBAL_EDITORS = ['Admin', 'รองเลขาธิการ', 'Moderator']

function getRoles(session) {
  const r = session.user.roles
  return Array.isArray(r) ? r : (r || '').split(',').map(x => x.trim())
}

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id  = parseInt(params.id)
  const cat = await getCategoryById(id)
  if (!cat) return Response.json({ error: 'Not found' }, { status: 404 })

  const roles = getRoles(session)
  const isAdmin = ADMIN_ROLES.some(r => roles.includes(r))

  if (cat.is_global && !GLOBAL_EDITORS.some(r => roles.includes(r)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (!cat.is_global && !isAdmin && cat.owner_id !== session.user.discordId)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { name, icon, is_global } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })
  if (is_global && !GLOBAL_EDITORS.some(r => roles.includes(r)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  await updateCategory(id, name.trim(), icon || null, !!is_global, session.user.discordId)
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const id  = parseInt(params.id)
  const cat = await getCategoryById(id)
  if (!cat) return Response.json({ error: 'Not found' }, { status: 404 })

  const roles = getRoles(session)
  const isAdmin = ADMIN_ROLES.some(r => roles.includes(r))

  if (cat.is_global && !GLOBAL_EDITORS.some(r => roles.includes(r)))
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  if (!cat.is_global && !isAdmin && cat.owner_id !== session.user.discordId)
    return Response.json({ error: 'Forbidden' }, { status: 403 })

  await deleteCategory(id)
  return Response.json({ ok: true })
}
