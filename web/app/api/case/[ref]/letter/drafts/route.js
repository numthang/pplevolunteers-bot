import { gateCase } from '@/lib/caseGate.js'
import { getLetterDrafts } from '@/db/cases.js'

/** GET /api/case/[ref]/letter/drafts — รายการร่างหนังสือที่บันทึกไว้ */
export async function GET(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error

  const drafts = await getLetterDrafts(gate.caseRow.id)
  return Response.json({ drafts })
}
