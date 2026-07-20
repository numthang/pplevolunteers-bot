import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getUserScope, isProvincialCoordinator, isRegionalCoordinator, isAdmin } from '@/lib/callingAccess.js'
import { getContactById, updateContact, deleteContact } from '@/db/calling/contacts.js'

function canEdit(contact, access, userId) {
  if (isAdmin(access) || isRegionalCoordinator(access) || isProvincialCoordinator(access)) return true
  return contact.created_by === userId
}

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  try {
    const contact = await getContactById(parseInt(id))
    if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ data: contact })
  } catch (err) {
    console.error('[GET /api/calling/contacts/[id]]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access, userId } = await getEffectiveOrgIdentity(session)
  const { id } = await params

  try {
    const contact = await getContactById(parseInt(id))
    if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })

    if (!canEdit(contact, access, userId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty } = body

    if (!first_name) {
      return Response.json({ error: 'first_name is required' }, { status: 400 })
    }

    await updateContact(parseInt(id), {
      first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty,
      updated_by: session.user.userId,
    })

    return Response.json({ success: true })
  } catch (err) {
    console.error('[PUT /api/calling/contacts/[id]]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access, userId } = await getEffectiveOrgIdentity(session)
  const { id } = await params

  try {
    const contact = await getContactById(parseInt(id))
    if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })

    if (!canEdit(contact, access, userId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await deleteContact(parseInt(id))
    return Response.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/calling/contacts/[id]]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
