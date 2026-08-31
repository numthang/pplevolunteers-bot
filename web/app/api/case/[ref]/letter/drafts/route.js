import { gateCase } from '@/lib/caseGate.js'
import { getLetterDrafts } from '@/db/cases.js'
import { getLetterConfig } from '@/db/caseLetterConfig.js'
import pool from '@/db/index.js'

/**
 * GET /api/case/[ref]/letter/drafts — รายการร่างหนังสือ + ค่าเริ่มต้นของ "ผู้ลงนาม"
 *
 * ค่าเริ่มต้นส่งมาจากที่นี่ที่เดียว เพราะ client ต้องใช้ทั้ง 2 ทาง:
 *   ร่างใหม่จาก AI → ใช้ค่าเริ่มต้น · เปิดร่างเก่า → ใช้ค่าในร่าง ถ้าร่างนั้นไม่มี (ร่างยุคก่อน) ค่อยตกมาใช้ค่าเริ่มต้น
 *
 * ผู้ลงนาม = คนที่กดร่าง (ร่างแทนคนอื่นได้ จึงแก้ได้ทุกช่องในโมดัล แล้วเก็บติดไปกับร่าง)
 * ชื่อตกมาที่ config.signer_name ได้ เพราะ users.firstname มีแค่ 1,273/6,751 คน
 */
export async function GET(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error

  const [drafts, config, me] = await Promise.all([
    getLetterDrafts(gate.caseRow.id),
    getLetterConfig(gate.orgId, gate.caseRow.province),
    pool.query(
      `SELECT NULLIF(TRIM(CONCAT_WS(' ', firstname, lastname)), '') AS name, phone FROM users WHERE id = $1`,
      [gate.session.user.userId],
    ).then(r => r.rows[0] || {}),
  ])

  return Response.json({
    drafts,
    signerDefaults: {
      signer_name:     me.name || config?.signer_name || '',
      signer_position: config?.signer_position || '',
      signer_phone:    me.phone || '',
    },
  })
}
