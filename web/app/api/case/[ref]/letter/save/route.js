import { gateCase } from '@/lib/caseGate.js'
import { saveLetterDraft, updateLetterDraft, deleteLetterDraft } from '@/db/cases.js'

/** POST — บันทึกร่างใหม่ หรืออัปเดตฉบับเดิม (ถ้ามี id) */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error

  const body = await req.json().catch(() => ({}))
  const { id, ...fields } = body

  if (id) {
    const updated = await updateLetterDraft(gate.caseRow.id, id, fields)
    if (!updated) return Response.json({ error: 'ไม่พบร่างนี้' }, { status: 404 })
    return Response.json({ draft: updated })
  }

  const draft = await saveLetterDraft(gate.caseRow.id, fields)
  return Response.json({ draft }, { status: 201 })
}

/** DELETE — ลบร่าง */
export async function DELETE(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error

  const { id } = await req.json().catch(() => ({}))
  if (!id) return Response.json({ error: 'ต้องการ id' }, { status: 400 })

  await deleteLetterDraft(gate.caseRow.id, id)
  return Response.json({ ok: true })
}
