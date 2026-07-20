import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { updatePayer, removePayer } from '@/db/docs/payers.js'

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const orgId = await getOrgId(session)
    const { displayName, position, sortOrder } = await req.json()

    const updated = await updatePayer(Number(id), orgId, { displayName, position, sortOrder })
    if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })

    return Response.json({ data: updated })
  } catch (err) {
    console.error('[PATCH /api/docs/payers/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const orgId = await getOrgId(session)
    const deleted = await removePayer(Number(id), orgId)
    if (!deleted) return Response.json({ error: 'Not found' }, { status: 404 })

    return Response.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/docs/payers/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
