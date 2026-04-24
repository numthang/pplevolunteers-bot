import { getServerSession } from 'next-auth'
import * as campaignDB from '@/db/calling/campaigns.js'
import { isAdmin, getUserScope, canCreateCampaign } from '@/lib/callingAccess.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveRoles } from '@/lib/getEffectiveRoles.js'
import pool from '@/db/index.js'

/**
 * GET /api/calling/campaigns
 * Fetch campaigns, optionally filtered by province, active status
 * Permission: authenticated users
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const province = searchParams.get('province')
  const active = searchParams.get('active') === 'true'
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    let rows = []

    if (province) {
      rows = await campaignDB.getCampaignsByProvince(province)
    } else {
      rows = await campaignDB.getCampaigns()
    }

    // Filter by user scope (unless admin)
    const userRoles = await getEffectiveRoles(session)
    const isUserAdmin = isAdmin(userRoles)
    const userScope = getUserScope(userRoles)

    if (!isUserAdmin && userScope) {
      rows = rows.filter(c => !c.province || userScope.includes(c.province))
    }

    // Filter active campaigns (not reached event_date yet)
    if (active) {
      const now = new Date()
      rows = rows.filter(c => !c.event_date || new Date(c.event_date) > now)
    }

    // Limit results
    rows = rows.slice(0, limit)

    // Add pending_count for each campaign (members assigned to user with no calls yet)
    const enriched = await Promise.all(
      rows.map(async (campaign) => {
        try {
          const [[result]] = await pool.query(
            `SELECT COUNT(*) as cnt FROM calling_assignments ca
             WHERE ca.campaign_id = ? AND ca.assigned_to = ?
             AND NOT EXISTS (
               SELECT 1 FROM calling_logs cl
               WHERE cl.campaign_id = ca.campaign_id AND cl.member_id = ca.member_id
             )`,
            [campaign.id, session.user.discordId]
          )
          return { ...campaign, pending_count: result?.cnt || 0 }
        } catch (e) {
          return { ...campaign, pending_count: 0 }
        }
      })
    )

    return Response.json({ success: true, data: enriched })
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

  const userRoles = await getEffectiveRoles(session)
  if (!canCreateCampaign(userRoles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, name, description, province } = body

    if (!name) {
      return Response.json({ error: 'Campaign name is required' }, { status: 400 })
    }

    const campaignId = await campaignDB.createCampaign(
      { id: id || null, name, description, province },
      session.user.discordId
    )

    const campaign = await campaignDB.getCampaignById(campaignId)

    return Response.json({ success: true, data: campaign }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/calling/campaigns]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
