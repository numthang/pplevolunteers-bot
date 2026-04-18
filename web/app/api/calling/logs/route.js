import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { createLog, getLogsByCampaignMember } from '@/db/calling/logs.js'
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

    const logs = await getLogsByCampaignMember(
      campaignId ? parseInt(campaignId) : null,
      parseInt(memberId)
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
    const { campaign_id, member_id, status, sig_overall, sig_location, sig_availability, sig_interest, sig_reachable, note, extra } = body

    if (!member_id || !status) {
      return Response.json({ error: 'member_id and status are required' }, { status: 400 })
    }

    const logId = await createLog({
      campaign_id: campaign_id || 0,
      member_id,
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

    // Auto-calculate and update tier if signals are present
    if (status === 'answered') {
      const tier = await calculateTierFromSignals(member_id)
      if (tier) await upsertTier(member_id, tier, 'auto')
    }

    return Response.json({ success: true, data: { id: logId } }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/calling/logs]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
