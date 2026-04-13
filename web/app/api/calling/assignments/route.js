import { getServerSession } from 'next-auth'
import * as assignmentDB from '@/db/calling/assignments.js'
import * as memberDB from '@/db/calling/members.js'
import { isAdmin, canAssignInProvince } from '@/lib/callingAccess.js'
import { authOptions } from '@/lib/auth-options.js'

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

  if (!campaignId) {
    return Response.json({ error: 'campaignId is required' }, { status: 400 })
  }

  try {
    const assignments = await assignmentDB.getAssignmentsByCampaign(parseInt(campaignId))
    return Response.json({ success: true, data: assignments })
  } catch (error) {
    console.error('[GET /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/calling/assignments
 * Bulk assign members
 * Permission: admin + scope check
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id, member_ids, assigned_to } = body

    if (!campaign_id || !member_ids || !Array.isArray(member_ids) || !assigned_to) {
      return Response.json(
        { error: 'campaign_id, member_ids (array), and assigned_to are required' },
        { status: 400 }
      )
    }

    const userRoles = session.user.roles || []

    // Check permission for each member
    const membersToCheck = await Promise.all(
      member_ids.map(id => memberDB.getMemberById(id))
    )

    const invalidMembers = []
    for (const member of membersToCheck) {
      if (!member) {
        invalidMembers.push('Member not found')
        continue
      }

      if (!canAssignInProvince(member.province, userRoles)) {
        invalidMembers.push(`Cannot assign in ${member.province}`)
      }
    }

    if (invalidMembers.length > 0) {
      return Response.json({ error: 'Forbidden', details: invalidMembers }, { status: 403 })
    }

    // Bulk assign
    const affectedRows = await assignmentDB.bulkAssignMembers(
      campaign_id,
      member_ids,
      assigned_to,
      session.user.discordId
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
    const { campaign_id, member_id, assigned_to } = body

    if (!campaign_id || !member_id || !assigned_to) {
      return Response.json(
        { error: 'campaign_id, member_id, and assigned_to are required' },
        { status: 400 }
      )
    }

    // Check member
    const member = await memberDB.getMemberById(member_id)
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Check permission
    const userRoles = session.user.roles || []
    if (!canAssignInProvince(member.province, userRoles)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Upsert assignment
    await assignmentDB.assignMember(campaign_id, member_id, assigned_to, session.user.discordId)

    const assignment = await assignmentDB.getAssignment(campaign_id, member_id)
    return Response.json({ success: true, data: assignment })
  } catch (error) {
    console.error('[PUT /api/calling/assignments]', error)
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
    const { campaign_id, member_id } = body

    if (!campaign_id || !member_id) {
      return Response.json(
        { error: 'campaign_id and member_id are required' },
        { status: 400 }
      )
    }

    // Check member
    const member = await memberDB.getMemberById(member_id)
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Check permission
    const userRoles = session.user.roles || []
    if (!canAssignInProvince(member.province, userRoles)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await assignmentDB.unassignMember(campaign_id, member_id)

    return Response.json({ success: true, message: 'Member unassigned' })
  } catch (error) {
    console.error('[DELETE /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
