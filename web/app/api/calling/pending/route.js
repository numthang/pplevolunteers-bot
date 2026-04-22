import { getServerSession } from 'next-auth'
import * as memberDB from '@/db/calling/members.js'
import { authOptions } from '@/lib/auth-options.js'

/**
 * GET /api/calling/pending
 * Returns members assigned to the current user, with call status, latest note, stats
 * Query params:
 *   campaigns=true  → return only campaigns that have assignments for me
 *   campaignId      → filter by campaign
 *   status          → 'pending' | 'called'
 *   limit / offset
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const countOnly = searchParams.get('count') === 'true'
  const campaignsOnly = searchParams.get('campaigns') === 'true'
  const campaignId = searchParams.get('campaignId')
  const status = searchParams.get('status')
  const rsvp = searchParams.get('rsvp')
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    if (countOnly) {
      const count = await memberDB.getPendingCallCount(session.user.discordId)
      return Response.json({ success: true, count })
    }

    if (campaignsOnly) {
      const campaigns = await memberDB.getMyCampaigns(session.user.discordId)
      return Response.json({ success: true, data: campaigns })
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
