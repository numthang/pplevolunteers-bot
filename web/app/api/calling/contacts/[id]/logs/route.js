import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getContactById, getContactLogs } from '@/db/calling/contacts.js'

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const contactId = parseInt(params.id)
    const contact = await getContactById(contactId)
    if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })

    const logs = await getContactLogs(contactId)
    return Response.json({ data: logs })
  } catch (err) {
    console.error('[GET /api/calling/contacts/[id]/logs]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
