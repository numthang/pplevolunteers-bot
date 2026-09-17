import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { listExternalPayees } from '@/db/docs/externalPayees.js'
import { createExternalPayeeFromInput } from '@/lib/externalPayeeInput.js'

/** GET /api/docs/external-payees — รายชื่อคนนอกทั้งหมดของ org (หน้า settings) */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const data = await listExternalPayees(await getOrgId(session))
  return Response.json({ success: true, data })
}

/**
 * POST /api/docs/external-payees — สร้างผู้รับเงินคนนอก
 * เรียกตอนกด "บันทึก" ในฟอร์มเท่านั้น (กฎ Create: ห้ามสร้างแถวตอนกดปุ่ม "เพิ่ม")
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access, userId } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const r = await createExternalPayeeFromInput(await getOrgId(session), userId, body)
    if (r.error) return Response.json({ error: r.error, existing: r.existing }, { status: r.status })
    return Response.json({ success: true, data: r.data })
  } catch (err) {
    console.error('[POST /api/docs/external-payees]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
