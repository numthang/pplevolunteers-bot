import { getServerSession } from 'next-auth'
import * as assignmentDB from '@/db/calling/assignments.js'
import * as campaignDB from '@/db/calling/campaigns.js'
import { getUserScope } from '@/lib/callingAccess.js'
import { getEffectiveRoles } from '@/lib/getEffectiveRoles.js'
import { authOptions } from '@/lib/auth-options.js'

function canSeeProvince(province, userRoles, primaryProvince) {
  const scope = getUserScope(userRoles, primaryProvince)
  return scope === null || scope.includes(province)
}

/**
 * GET /api/calling/assignments
 * Fetch assignments in campaign
 * Permission: authenticated users
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const campaignId = searchParams.get('campaignId')

  const memberId = searchParams.get('memberId')

  try {
    if (memberId) {
      const assignment = await assignmentDB.getAssignment(parseInt(memberId), campaignId ? parseInt(campaignId) : 0)
      return Response.json({ success: true, data: assignment })
    }
    const assignments = await assignmentDB.getAssignmentsByCampaign(campaignId ? parseInt(campaignId) : 0)
    return Response.json({ success: true, data: assignments })
  } catch (error) {
    console.error('[GET /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/calling/assignments
 * Bulk assign members
 * Permission: can view campaign province
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id = 0, member_ids, assigned_to, contact_type = 'member' } = body

    if (!member_ids || !Array.isArray(member_ids) || !assigned_to) {
      return Response.json(
        { error: 'member_ids (array) and assigned_to are required' },
        { status: 400 }
      )
    }

    const campaign = await campaignDB.getCampaignById(campaign_id || 0)
    if (!campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const userRoles = await getEffectiveRoles(session)
    if (!canSeeProvince(campaign.province, userRoles, session.user.primary_province)) {
      return Response.json({ error: `Forbidden: cannot assign in ${campaign.province}` }, { status: 403 })
    }

    const affectedRows = await assignmentDB.bulkAssignMembers(
      member_ids,
      assigned_to,
      session.user.discordId,
      campaign_id || 0,
      contact_type
    )

    return Response.json({
      success: true,
      message: `${affectedRows} members assigned`,
      affected: affectedRows
    })
  } catch (error) {
    console.error('[POST /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PUT /api/calling/assignments
 * Update single assignment
 */
export async function PUT(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id = 0, member_id, assigned_to } = body

    if (!member_id || !assigned_to) {
      return Response.json(
        { error: 'member_id and assigned_to are required' },
        { status: 400 }
      )
    }

    const campaign = await campaignDB.getCampaignById(campaign_id || 0)
    if (!campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const userRoles = await getEffectiveRoles(session)
    if (!canSeeProvince(campaign.province, userRoles, session.user.primary_province)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await assignmentDB.assignMember(parseInt(member_id), assigned_to, session.user.discordId, campaign_id || 0)

    const assignment = await assignmentDB.getAssignment(parseInt(member_id), campaign_id || 0)
    return Response.json({ success: true, data: assignment })
  } catch (error) {
    console.error('[PUT /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH /api/calling/assignments
 * Update RSVP for an assignment
 */
export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id = 0, member_id, rsvp } = body

    if (!member_id) {
      return Response.json({ error: 'member_id is required' }, { status: 400 })
    }
    if (rsvp !== null && !['yes', 'no', 'maybe'].includes(rsvp)) {
      return Response.json({ error: 'rsvp must be yes, no, maybe, or null' }, { status: 400 })
    }

    await assignmentDB.updateRsvp(parseInt(member_id), campaign_id || 0, rsvp)
    const assignment = await assignmentDB.getAssignment(parseInt(member_id), campaign_id || 0)
    return Response.json({ success: true, data: assignment })
  } catch (error) {
    console.error('[PATCH /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/calling/assignments
 * Unassign member
 */
export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id = 0, member_id, contact_type = 'member' } = body

    if (!member_id) {
      return Response.json(
        { error: 'member_id is required' },
        { status: 400 }
      )
    }

    const campaign = await campaignDB.getCampaignById(campaign_id || 0)
    if (!campaign) {
      return Response.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const userRoles = await getEffectiveRoles(session)
    if (!canSeeProvince(campaign.province, userRoles, session.user.primary_province)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await assignmentDB.unassignMember(parseInt(member_id), campaign_id || 0, contact_type)

    return Response.json({ success: true, message: 'Member unassigned' })
  } catch (error) {
    console.error('[DELETE /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
