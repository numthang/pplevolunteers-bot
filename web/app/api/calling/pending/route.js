import { getServerSession } from 'next-auth'
import * as memberDB from '@/db/calling/members.js'
import * as contactDB from '@/db/calling/contacts.js'
import { authOptions } from '@/lib/auth-options.js'
import { getOrgId } from '@/lib/orgContext.js'
import { pickMemberFieldsAll } from '@/lib/callingFields.js'
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
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
    const orgId = await getOrgId(session)
    if (historyMode) {
      const limit = Math.min(parseInt(searchParams.get('limit') || '60'), 200)
      const offset = parseInt(searchParams.get('offset') || '0')
      const flat = searchParams.get('flat') === 'true'
      const rows = flat
        ? await memberDB.getMyCallHistoryFlat(orgId, session.user.userId, { name, limit, offset })
        : await memberDB.getMyCallHistory(orgId, session.user.userId, { name, limit, offset })
      return Response.json({ success: true, data: pickMemberFieldsAll(rows), hasMore: rows.length === limit })
    }

    if (countOnly) {
      if (type === 'member') {
        const count = await memberDB.getPendingCallCount(session.user.userId)
        return Response.json({ success: true, count })
      }
      if (type === 'contact') {
        const count = await contactDB.getContactPendingCount(session.user.userId)
        return Response.json({ success: true, count })
      }
      const [memberCount, contactCount] = await Promise.all([
        memberDB.getPendingCallCount(session.user.userId),
        contactDB.getContactPendingCount(session.user.userId),
      ])
      return Response.json({ success: true, count: memberCount + contactCount })
    }

    if (campaignsOnly) {
      const campaigns = await memberDB.getMyCampaigns(session.user.userId)
      return Response.json({ success: true, data: campaigns })
    }

    if (type === 'contact') {
      const contacts = await contactDB.getMyAssignedContacts(session.user.userId, {
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

    const members = await memberDB.getMyAssignedMembers(orgId, session.user.userId, {
      campaignId: campaignId ? parseInt(campaignId) : null,
      status: status || null,
      rsvp: rsvp || null,
      limit,
      offset
    })

    return Response.json({
      success: true,
      data: pickMemberFieldsAll(members),   // กันทะเบียนสมาชิกทั้งแถวหลุด (เลขบัตร ปชช./ที่อยู่/วันเกิด)
      hasMore: members.length === limit,
      limit,
      offset
    })
  } catch (error) {
    console.error('[GET /api/calling/pending]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
