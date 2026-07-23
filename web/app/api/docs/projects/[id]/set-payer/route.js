import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getDocProjectByEventId } from '@/db/docs/projects.js'
import { setRecipientGroupPayer, setProjectPayer } from '@/db/docs/entries.js'

/**
 * POST /api/docs/projects/[id]/set-payer   (id = act_event_cache_id)
 * 2 โหมด:
 *  - { recipientUserId, payerUserId } → override payer ของกลุ่มผู้รับคนเดียว
 *  - { payerUserId } เฉยๆ             → ตั้ง payer ระดับโครงการ (default + apply ทุก entry + auto-swap)
 * payer เปลี่ยน + เคยเซ็น → reset ลายเซ็น payer เดิม
 */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id } = await params
    const orgId = await getOrgId(session)
    const project = await getDocProjectByEventId(id, orgId)
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })

    const body = await req.json()
    const payerUserId     = body.payerUserId     ? Number(body.payerUserId)     : null
    const recipientUserId = body.recipientUserId ? Number(body.recipientUserId) : null
    if (!payerUserId) {
      return Response.json({ error: 'payerUserId จำเป็นต้องมี' }, { status: 400 })
    }
    if (recipientUserId && recipientUserId === payerUserId) {
      return Response.json({ error: 'ผู้จ่ายต้องไม่ใช่ผู้รับเงินคนเดียวกัน' }, { status: 400 })
    }

    let tokens
    if (recipientUserId) {
      // โหมด override รายกลุ่ม
      tokens = await setRecipientGroupPayer(project.id, recipientUserId, payerUserId)
    } else {
      // โหมดระดับโครงการ
      tokens = await setProjectPayer(project.id, payerUserId, orgId, project.province ?? null)
    }

    return Response.json({ success: true, data: { payer_user_id: payerUserId, entries: tokens } })
  } catch (err) {
    console.error('[POST /api/docs/projects/:id/set-payer]', err)
    return Response.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
