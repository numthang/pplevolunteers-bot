import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { updateCategory, deleteCategory } from '@/db/finance/categories.js'
import { isAdmin } from '@/lib/roles.js'

export async function PUT(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  await updateCategory(id, name)
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session.user.roles)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  await deleteCategory(id)
  return Response.json({ ok: true })
}
