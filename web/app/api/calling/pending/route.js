import { getServerSession } from 'next-auth'
import * as memberDB from '@/db/calling/members.js'
import * as contactDB from '@/db/calling/contacts.js'
import { authOptions } from '@/lib/auth-options.js'
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const countOnly = searchParams.get('count') === 'true'
  const campaignsOnly = searchParams.get('campaigns') === 'true'
  const type = searchParams.get('type') || 'member'
  const campaignId = searchParams.get('campaignId')
  const status = searchParams.get('status')
  const rsvp = searchParams.get('rsvp')
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  const historyMode = searchParams.get('history') === 'true'
  const name = searchParams.get('name') || ''

  try {
    if (historyMode) {
      const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
      const offset = parseInt(searchParams.get('offset') || '0')
      const rows = await memberDB.getMyCallHistory(session.user.discordId, { name, limit, offset })
      return Response.json({ success: true, data: rows, hasMore: rows.length === limit })
    }

    if (countOnly) {
      if (type === 'member') {
        const count = await memberDB.getPendingCallCount(session.user.discordId)
        return Response.json({ success: true, count })
      }
      if (type === 'contact') {
        const count = await contactDB.getContactPendingCount(session.user.discordId)
        return Response.json({ success: true, count })
      }
      const [memberCount, contactCount] = await Promise.all([
        memberDB.getPendingCallCount(session.user.discordId),
        contactDB.getContactPendingCount(session.user.discordId),
      ])
      return Response.json({ success: true, count: memberCount + contactCount })
    }

    if (campaignsOnly) {
      const campaigns = await memberDB.getMyCampaigns(session.user.discordId)
      return Response.json({ success: true, data: campaigns })
    }

    if (type === 'contact') {
      const contacts = await contactDB.getMyAssignedContacts(session.user.discordId, {
        campaignId: campaignId ? parseInt(campaignId) : null,
        status: status || null,
        limit,
        offset,
      })
      return Response.json({
        success: true,
        data: contacts,
        hasMore: contacts.length === limit,
        limit,
        offset,
      })
    }

    const members = await memberDB.getMyAssignedMembers(session.user.discordId, {
      campaignId: campaignId ? parseInt(campaignId) : null,
      status: status || null,
      rsvp: rsvp || null,
      limit,
      offset
    })

    return Response.json({
      success: true,
      data: members,
      hasMore: members.length === limit,
      limit,
      offset
    })
  } catch (error) {
    console.error('[GET /api/calling/pending]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
