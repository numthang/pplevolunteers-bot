import { getServerSession } from 'next-auth'
import * as memberDB from '@/db/calling/members.js'
import { canAccessMember, getUserScope, isAdmin, canSeeContacts } from '@/lib/callingAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { authOptions } from '@/lib/auth-options.js'

/**
 * GET /api/calling/members
 * Query members with filters (campaign, province, district, search)
 * Permission: authenticated users (scope-filtered)
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')
  const province = searchParams.get('province')
  const district = searchParams.get('district')
  const keyword = searchParams.get('search')
  const statsOnly = searchParams.get('stats') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
  const offset = parseInt(searchParams.get('offset') || '0')

  // Campaign-specific filters
  const filterAmphure = searchParams.get('amphure') || null
  const subdistricts = searchParams.get('subdistricts')
  const filterSubdistricts = subdistricts ? subdistricts.split(',') : null
  const filterTier = searchParams.get('tier') || null
  const filterStatus = searchParams.get('status') || null
  const filterAssignedTo = searchParams.get('assignedTo') || null
  const filterRsvp = searchParams.get('rsvp') || null
  const filterName = searchParams.get('name') || null
  const filterExpiry = searchParams.get('expiry') || null
  const filterCalled = searchParams.get('called') || null
  const filterSort = searchParams.get('sort') || null
  const filterSms = searchParams.get('sms') || null

  try {
    const { access } = await getEffectiveIdentity(session)
    const guildId = await getGuildId(session)
    const userScope = getUserScope(access, session.user.primary_province)
    const isUserAdmin = isAdmin(access)

    // Stats-only request
    if (campaignId && statsOnly) {
      const stats = await memberDB.getMembersInCampaignStats(guildId, parseInt(campaignId))
      return Response.json({ success: true, data: stats })
    }

    let rows = []
    let total = 0

    if (campaignId) {
      const filters = { amphure: filterAmphure, subdistricts: filterSubdistricts, tier: filterTier, status: filterStatus, assignedTo: filterAssignedTo, rsvp: filterRsvp, name: filterName, expiry: filterExpiry, called: filterCalled, sort: filterSort, sms: filterSms }
      rows = await memberDB.getMembersInCampaign(guildId, parseInt(campaignId), filters, limit, offset)
    } else if (province) {
      rows = await memberDB.getMembersByProvince(guildId, province, limit, offset)
    } else if (district) {
      rows = await memberDB.getMembersByDistrict(guildId, district, limit, offset)
    } else if (keyword) {
      rows = await memberDB.searchMembers(guildId, keyword, limit, offset)
    } else {
      rows = await memberDB.getAllMembers(guildId, limit, offset)
      total = await memberDB.getMembersCount(guildId)
    }

    // No calling roles at all → return noAccess flag
    if (!isUserAdmin && Array.isArray(userScope) && userScope.length === 0) {
      return Response.json({ success: true, data: [], hasMore: false, noAccess: true, limit, offset })
    }

    // Filter by user scope (unless admin)
    if (!isUserAdmin && userScope) {
      rows = rows.filter(m => userScope.includes(m.home_province))
    }

    const showContacts = canSeeContacts(access)
    if (!showContacts) {
      rows = rows.map(({ mobile_number, line_id, ...rest }) => rest)
    }

    return Response.json({
      success: true,
      data: rows,
      contacts_hidden: !showContacts,
      hasMore: rows.length === limit,
      limit,
      offset
    })
  } catch (error) {
    console.error('[GET /api/calling/members]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
