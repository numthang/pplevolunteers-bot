import { getServerSession } from 'next-auth'
import * as tierDB from '@/db/calling/tiers.js'
import * as memberDB from '@/db/calling/members.js'
import { canAccessMember, canOverrideTier } from '@/lib/callingAccess.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

/**
 * GET /api/calling/tiers
 * Fetch tier for member(s)
 * Permission: authenticated users
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const memberId = searchParams.get('memberId')
  const memberIds = searchParams.getAll('memberIds')

  try {
    if (memberId) {
      const tier = await tierDB.getTier(memberId)
      return Response.json({ success: true, data: tier })
    } else if (memberIds.length > 0) {
      const tiers = await tierDB.getTiersByMembers(memberIds)
      return Response.json({ success: true, data: tiers })
    } else {
      return Response.json({ error: 'memberId or memberIds is required' }, { status: 400 })
    }
  } catch (error) {
    console.error('[GET /api/calling/tiers]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * POST /api/calling/tiers
 * Override member tier manually
 * Permission: admin + เหรัญญิก
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { member_id, tier, reason } = body

    if (!member_id || !tier) {
      return Response.json(
        { error: 'member_id and tier are required' },
        { status: 400 }
      )
    }

    if (!['A', 'B', 'C', 'D'].includes(tier)) {
      return Response.json({ error: 'Invalid tier (must be A, B, C, or D)' }, { status: 400 })
    }

    // Check permission
    const { access } = await getEffectiveOrgIdentity(session)
    if (!canOverrideTier(access)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check member access (optional, for audit trail)
    const orgId = await getOrgId(session)
    const member = await memberDB.getMemberById(orgId, parseInt(member_id))
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Override tier
    await tierDB.overrideTier(orgId, member_id, tier, session.user.userId, reason)

    const updated = await tierDB.getTier(member_id)
    return Response.json({ success: true, data: updated }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/calling/tiers]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * PATCH /api/calling/tiers
 * Set or clear member flag (green/yellow/red)
 * Permission: authenticated users
 */
export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { member_id, flag, contact_type = 'member' } = await req.json()
    if (!member_id) return Response.json({ error: 'member_id required' }, { status: 400 })
    if (flag && !['green', 'yellow', 'red'].includes(flag)) {
      return Response.json({ error: 'Invalid flag' }, { status: 400 })
    }
    const orgId = await getOrgId(session)
    await tierDB.updateFlag(orgId, member_id, flag || null, contact_type)
    return Response.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/calling/tiers]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/calling/tiers/:memberId
 * Clear manual override (revert to auto)
 * Permission: admin
 */
export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { member_id } = body

    if (!member_id) {
      return Response.json({ error: 'member_id is required' }, { status: 400 })
    }

    // Check permission
    const { access } = await getEffectiveOrgIdentity(session)
    if (!canOverrideTier(access)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check member
    const orgId = await getOrgId(session)
    const member = await memberDB.getMemberById(orgId, parseInt(member_id))
    if (!member) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    // Clear override
    await tierDB.clearOverride(orgId, member_id)

    const updated = await tierDB.getTier(member_id)
    return Response.json({ success: true, data: updated })
  } catch (error) {
    console.error('[DELETE /api/calling/tiers]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
