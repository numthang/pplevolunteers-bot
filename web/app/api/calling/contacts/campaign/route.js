import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveRoles } from '@/lib/getEffectiveRoles.js'
import { getUserScope, isAdmin } from '@/lib/callingAccess.js'
import { getContactsInCampaign, getContactsInCampaignStats } from '@/db/calling/contacts.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const campaignId = parseInt(searchParams.get('campaignId'))
  const statsOnly  = searchParams.get('stats') === 'true'
  const limit      = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset     = parseInt(searchParams.get('offset') || '0')

  if (!campaignId) return Response.json({ error: 'campaignId is required' }, { status: 400 })

  try {
    const userRoles  = await getEffectiveRoles(session)
    const userScope  = getUserScope(userRoles, session.user.primary_province)
    const isUserAdmin = isAdmin(userRoles)

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
    }

    const rows = await getContactsInCampaign(campaignId, filters, limit, offset)

    // scope filter — contacts by province
    const filtered = (isUserAdmin || !userScope)
      ? rows
      : rows.filter(c => !c.province || userScope.includes(c.province))

    return Response.json({
      success: true,
      data: filtered,
      hasMore: filtered.length === limit,
      limit,
      offset,
    })
  } catch (err) {
    console.error('[GET /api/calling/contacts/campaign]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
