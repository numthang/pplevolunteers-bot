import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { createLog, getLogsByCampaignMember, getLogById, updateLog, deleteLog } from '@/db/calling/logs.js'
import { calculateTierFromSignals, upsertTier } from '@/db/calling/tiers.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')
    const memberId = searchParams.get('memberId')

    if (!memberId) {
      return Response.json({ error: 'memberId is required' }, { status: 400 })
    }

    const contactType = searchParams.get('contactType') || 'member'
    const logs = await getLogsByCampaignMember(
      campaignId ? parseInt(campaignId) : null,
      parseInt(memberId),
      contactType
    )
    return Response.json({ data: logs })
  } catch (error) {
    console.error('[GET /api/calling/logs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { campaign_id, member_id, contact_type = 'member', status, sig_overall, sig_location, sig_availability, sig_interest, sig_reachable, note, extra } = body

    if (!member_id || !status) {
      return Response.json({ error: 'member_id and status are required' }, { status: 400 })
    }

    const logId = await createLog({
      campaign_id: campaign_id || 0,
      member_id,
      contact_type,
      called_by: session.user.discordId,
      caller_name: session.user.nickname || session.user.name || null,
      status,
      sig_overall: sig_overall || null,
      sig_location: sig_location || null,
      sig_availability: sig_availability || null,
      sig_interest: sig_interest || null,
      sig_reachable: sig_reachable || null,
      note: note || null,
      extra: extra || null,
    })

    // Auto-calculate and update tier if signals are present (answered call หรือ พบปะ)
    if (status === 'answered' || status === 'met') {
      const tier = await calculateTierFromSignals(member_id, null, contact_type)
      if (tier) await upsertTier(member_id, tier, 'auto', contact_type)
    }

    return Response.json({ success: true, data: { id: logId } }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/calling/logs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

const MODERATOR_ROLES = ['Admin', 'เลขาธิการ', 'Moderator']

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, status, note, sig_overall, sig_location, sig_availability, sig_interest, sig_reachable } = body
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const log = await getLogById(id)
    if (!log) return Response.json({ error: 'Not found' }, { status: 404 })

    const userRoles = session.user.roles || []
    const isModerator = MODERATOR_ROLES.some(r => userRoles.includes(r))
    if (log.called_by !== session.user.discordId && !isModerator) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    await updateLog(id, { status, note, sig_overall, sig_location, sig_availability, sig_interest, sig_reachable })

    if (status === 'answered' || status === 'met' || log.status === 'answered' || log.status === 'met') {
      const tier = await calculateTierFromSignals(log.member_id, null, log.contact_type)
      if (tier) await upsertTier(log.member_id, tier, 'auto', log.contact_type)
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/calling/logs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { searchParams } = new URL(req.url)
    const id = parseInt(searchParams.get('id'))
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const userRoles = session.user.roles || []
    const isModerator = MODERATOR_ROLES.some(r => userRoles.includes(r))
    if (!isModerator) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await deleteLog(id)
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/calling/logs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
