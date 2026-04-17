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

  try {
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
 * Permission: admin + scope check
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id = 0, member_ids, assigned_to } = body

    if (!member_ids || !Array.isArray(member_ids) || !assigned_to) {
      return Response.json(
        { error: 'member_ids (array) and assigned_to are required' },
        { status: 400 }
      )
    }

    const userRoles = session.user.roles || []

    // Check permission for each member
    const membersToCheck = await Promise.all(
      member_ids.map(id => memberDB.getMemberById(parseInt(id)))
    )

    const invalidMembers = []
    for (const member of membersToCheck) {
      if (!member) {
        invalidMembers.push('Member not found')
        continue
      }

      if (!canAssignInProvince(member.home_province, userRoles)) {
        invalidMembers.push(`Cannot assign in ${member.home_province}`)
      }
    }

    if (invalidMembers.length > 0) {
      return Response.json({ error: 'Forbidden', details: invalidMembers }, { status: 403 })
    }

    // Bulk assign
    const affectedRows = await assignmentDB.bulkAssignMembers(
      member_ids,
      assigned_to,
      session.user.discordId,
      campaign_id || 0
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

    // Check member
    const member = await memberDB.getMemberById(parseInt(member_id))
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Check permission
    const userRoles = session.user.roles || []
    if (!canAssignInProvince(member.home_province, userRoles)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Upsert assignment
    await assignmentDB.assignMember(parseInt(member_id), assigned_to, session.user.discordId, campaign_id || 0)

    const assignment = await assignmentDB.getAssignment(parseInt(member_id), campaign_id || 0)
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
    const { campaign_id = 0, member_id } = body

    if (!member_id) {
      return Response.json(
        { error: 'member_id is required' },
        { status: 400 }
      )
    }

    // Check member
    const member = await memberDB.getMemberById(parseInt(member_id))
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Check permission
    const userRoles = session.user.roles || []
    if (!canAssignInProvince(member.home_province, userRoles)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await assignmentDB.unassignMember(parseInt(member_id), campaign_id || 0)

    return Response.json({ success: true, message: 'Member unassigned' })
  } catch (error) {
    console.error('[DELETE /api/calling/assignments]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
