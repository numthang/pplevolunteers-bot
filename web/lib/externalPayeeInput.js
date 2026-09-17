import { isValidThaiId, digitsOnly } from '@/lib/thaiId.js'
import { createExternalPayee, findByIdNumber } from '@/db/docs/externalPayees.js'

/**
 * สร้างผู้รับเงินคนนอก — ใช้ร่วมกันระหว่าง Docs กับรอบจ่ายการเงิน
 * (สิทธิ์ต่างกัน แต่กติกาข้อมูลต้องชุดเดียว ไม่งั้นสองหน้ากรองไม่เท่ากัน)
 *
 * @returns {{ data } | { error, status, existing? }}
 */
export async function createExternalPayeeFromInput(orgId, userId, body) {
  const type  = body.payee_type === 'entity' ? 'entity' : 'person'
  const idNum = digitsOnly(body.id_number)

  if (type === 'entity') {
    if (!body.entity_name?.trim()) return { error: 'ต้องระบุชื่อร้าน/นิติบุคคล', status: 400 }
  } else if (!body.first_name?.trim() || !body.last_name?.trim()) {
    return { error: 'ต้องระบุชื่อและนามสกุล', status: 400 }
  }

  // checksum ผิด = เลขพิมพ์ผิดหรือ OCR อ่านเพี้ยน — กันไว้ที่นี่ด้วย ไม่พึ่ง UI อย่างเดียว
  // (นิติบุคคลใช้เลขผู้เสียภาษี 13 หลักสูตรเดียวกัน จึงตรวจเหมือนกัน)
  if (idNum && !isValidThaiId(idNum)) {
    return { error: 'เลขประจำตัว 13 หลักไม่ถูกต้อง (ตรวจสอบเลขอีกครั้ง)', status: 400 }
  }

  if (idNum) {
    const dup = await findByIdNumber(orgId, idNum)
    if (dup) return { error: 'มีผู้รับเงินเลขนี้ในระบบแล้ว', status: 409, existing: dup }
  }

  const data = await createExternalPayee(orgId, userId, { ...body, payee_type: type, id_number: idNum || null })
  return { data }
}
