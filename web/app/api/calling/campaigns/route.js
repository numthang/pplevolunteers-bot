import { getServerSession } from 'next-auth'
import * as campaignDB from '@/db/calling/campaigns.js'
import { isAdmin, getUserScope, canCreateCampaign } from '@/lib/callingAccess.js'
import { authOptions } from '@/lib/auth-options.js'

/**
 * GET /api/calling/campaigns
 * Fetch campaigns, optionally filtered by province
 * Permission: authenticated users
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const province = searchParams.get('province')

  try {
    let rows = []

    if (province) {
      rows = await campaignDB.getCampaignsByProvince(province)
    } else {
      rows = await campaignDB.getCampaigns()
    }

    // Filter by user scope (unless admin)
    const userRoles = session.user.roles || []
    const isUserAdmin = isAdmin(userRoles)
    const userScope = getUserScope(userRoles)

    if (!isUserAdmin && userScope) {
      rows = rows.filter(c => !c.province || userScope.includes(c.province))
    }

    return Response.json({ success: true, data: rows })
  } catch (error) {
    console.error('[GET /api/calling/campaigns]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/calling/campaigns
 * Create campaign
 * Permission: authenticated users
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRoles = session.user.roles || []
  if (!canCreateCampaign(userRoles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, description, province, act_id } = body

    if (!name) {
      return Response.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const campaignId = await campaignDB.createCampaign(
      { name, description, province, act_id },
      session.user.discordId
    )

    const campaign = await campaignDB.getCampaignById(campaignId)

    return Response.json({ success: true, data: campaign }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/calling/campaigns]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
