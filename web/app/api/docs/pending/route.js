import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getPendingSignaturesForUser } from '@/db/docs/entries.js'

/**
 * GET /api/docs/pending — รายการที่ user คนนี้ต้องเซ็น (recipient + payer)
 * ใครก็เข้าได้ที่ login แล้ว (ไม่ต้องมีสิทธิ์ canManageDocs — คนทั่วไปก็มีบิลรอเซ็น)
 * ?count=true → คืน { recipient, payer, total } เป็นจำนวนนับสำหรับ badge
 */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(session)
  const { recipient, payer } = await getPendingSignaturesForUser(session.user.userId, orgId)

  const { searchParams } = new URL(req.url)
  if (searchParams.get('count') === 'true') {
    return Response.json({
      recipient: recipient.length,
      payer:     payer.length,
      total:     recipient.length + payer.length,
    })
  }

  return Response.json({ success: true, data: { recipient, payer } })
}
