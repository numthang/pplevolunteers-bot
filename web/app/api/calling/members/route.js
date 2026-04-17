import { getServerSession } from 'next-auth'
import * as memberDB from '@/db/calling/members.js'
import { canAccessMember, getUserScope, isAdmin } from '@/lib/callingAccess.js'
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
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 10000)
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    let rows = []
    let total = 0

    // Get user scope
    const userRoles = session.user.roles || []
    const userScope = getUserScope(userRoles)
    const isUserAdmin = isAdmin(userRoles)

    // Fetch members based on filter
    if (campaignId) {
      const numCampaignId = parseInt(campaignId)
      rows = await memberDB.getMembersInCampaign(numCampaignId, limit, offset)
    } else if (province) {
      rows = await memberDB.getMembersByProvince(province, limit, offset)
    } else if (district) {
      rows = await memberDB.getMembersByDistrict(district, limit, offset)
    } else if (keyword) {
      rows = await memberDB.searchMembers(keyword, limit, offset)
    } else {
      rows = await memberDB.getAllMembers(limit, offset)
      total = await memberDB.getMembersCount()
    }

    // Filter by user scope (unless admin)
    if (!isUserAdmin && userScope) {
      rows = rows.filter(m => userScope.includes(m.home_province))
    }

    return Response.json({
      success: true,
      data: rows,
      total: total || rows.length,
      limit,
      offset
    })
  } catch (error) {
    console.error('[GET /api/calling/members]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
