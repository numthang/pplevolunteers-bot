import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getUserScope, isAdmin, canSeeContacts } from '@/lib/callingAccess.js'
import { getContactsInCampaign, getContactsInCampaignStats } from '@/db/calling/contacts.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const campaignId = parseInt(searchParams.get('campaignId'))
  const statsOnly  = searchParams.get('stats') === 'true'
  const limit      = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset     = parseInt(searchParams.get('offset') || '0')

  if (!campaignId) return Response.json({ error: 'campaignId is required' }, { status: 400 })

  try {
    const { access }  = await getEffectiveOrgIdentity(session)
    const userScope   = getUserScope(access)
    const isUserAdmin = isAdmin(access)
    const showContacts = canSeeContacts(access)

    if (!isUserAdmin && Array.isArray(userScope) && userScope.length === 0) {
      return Response.json({ success: true, data: [], hasMore: false, noAccess: true })
    }

    if (statsOnly) {
      const provinces = (!isUserAdmin && Array.isArray(userScope)) ? userScope : null
      const stats = await getContactsInCampaignStats(campaignId, provinces)
      return Response.json({ success: true, data: stats })
    }

    const filters = {
      amphoe:     searchParams.get('amphoe')     || null,
      tier:       searchParams.get('tier')       || null,
      status:     searchParams.get('status')     || null,
      assignedTo: searchParams.get('assignedTo') || null,
      name:       searchParams.get('name')       || null,
      called:     searchParams.get('called')     || null,
      sort:       searchParams.get('sort')       || null,
      sms:        searchParams.get('sms')        || null,
    }

    let rows = await getContactsInCampaign(campaignId, filters, limit, offset)

    if (!showContacts) {
      rows = rows.map(({ phone, line_id, email, ...rest }) => rest)
    }

    return Response.json({
      success: true,
      data: rows,
      contacts_hidden: !showContacts,
      hasMore: rows.length === limit,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[GET /api/calling/contacts/campaign]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
