import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getContactById, getContactLogs } from '@/db/calling/contacts.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getUserScope } from '@/lib/callingAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access } = await getEffectiveOrgIdentity(session)
  const { id } = await params
  try {
    const contactId = parseInt(id)
    const contact = await getContactById(orgId, contactId)
    if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })

    const scope = getUserScope(access)
    if (scope !== null && !scope.includes(contact.province)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const logs = await getContactLogs(orgId, contactId)
    return Response.json({ data: logs })
  } catch (err) {
    console.error('[GET /api/calling/contacts/[id]/logs]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
