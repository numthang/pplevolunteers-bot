import { getServerSession } from 'next-auth'
import * as campaignDB from '@/db/calling/campaigns.js'
import { canCreateCampaign } from '@/lib/callingAccess.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    const campaign = await campaignDB.getCampaignById(orgId, parseInt(id))
    if (!campaign) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ success: true, data: campaign })
  } catch (error) {
    console.error('[GET /api/calling/campaigns/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canCreateCampaign(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    const body = await req.json()
    const { newId, name, description, province, event_date, event_end_date } = body
    if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

    const oldId = parseInt(id)
    const targetId = newId ? parseInt(newId) : oldId

    // ยืนยันว่าแคมเปญเป็นของ org นี้ก่อนแตะ (mutator ด้านล่างไม่มี org filter ในตัว)
    if (!(await campaignDB.getCampaignById(orgId, oldId))) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (newId && targetId !== oldId) {
      await campaignDB.renameCampaignId(oldId, targetId)
    }

    await campaignDB.updateCampaign(targetId, { name, description, province, event_date, event_end_date })
    const campaign = await campaignDB.getCampaignById(orgId, targetId)
    return Response.json({ success: true, data: campaign })
  } catch (error) {
    console.error('[PATCH /api/calling/campaigns/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canCreateCampaign(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    // ยืนยัน ownership ก่อนลบ — deleteCampaign ไม่มี org filter ในตัว
    if (!(await campaignDB.getCampaignById(orgId, parseInt(id)))) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    await campaignDB.deleteCampaign(parseInt(id))
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/calling/campaigns/[id]]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
