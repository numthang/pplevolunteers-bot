import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { isValidThaiId, digitsOnly } from '@/lib/thaiId.js'
import { listExternalPayees, createExternalPayee, findByIdNumber } from '@/db/docs/externalPayees.js'

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
    const body    = await req.json()
    const type    = body.payee_type === 'entity' ? 'entity' : 'person'
    const idNum   = digitsOnly(body.id_number)

    if (type === 'entity') {
      if (!body.entity_name?.trim()) return Response.json({ error: 'ต้องระบุชื่อร้าน/นิติบุคคล' }, { status: 400 })
    } else if (!body.first_name?.trim() || !body.last_name?.trim()) {
      return Response.json({ error: 'ต้องระบุชื่อและนามสกุล' }, { status: 400 })
    }

    // checksum ผิด = เลขพิมพ์ผิดหรือ OCR อ่านเพี้ยน — กันไว้ที่นี่ด้วย ไม่พึ่ง UI อย่างเดียว
    // (นิติบุคคลใช้เลขผู้เสียภาษี 13 หลักสูตรเดียวกัน จึงตรวจเหมือนกัน)
    if (idNum && !isValidThaiId(idNum)) {
      return Response.json({ error: 'เลขประจำตัว 13 หลักไม่ถูกต้อง (ตรวจสอบเลขอีกครั้ง)' }, { status: 400 })
    }

    const orgId = await getOrgId(session)
    if (idNum) {
      const dup = await findByIdNumber(orgId, idNum)
      if (dup) return Response.json({ error: 'มีผู้รับเงินเลขนี้ในระบบแล้ว', existing: dup }, { status: 409 })
    }

    const created = await createExternalPayee(orgId, userId, { ...body, payee_type: type, id_number: idNum || null })
    return Response.json({ success: true, data: created })
  } catch (err) {
    console.error('[POST /api/docs/external-payees]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
