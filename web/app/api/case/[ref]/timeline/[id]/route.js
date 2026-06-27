import { gateCase } from '@/lib/caseGate.js'
import { toggleTimelinePublic, deleteTimelineEntry, getTimeline } from '@/db/cases.js'

/** PATCH /api/case/[ref]/timeline/[id] — toggle is_public */
export async function PATCH(req, { params }) {
  const { ref, id } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { caseRow } = gate

  const { is_public } = await req.json().catch(() => ({}))
  await toggleTimelinePublic(Number(id), caseRow.id, !!is_public)
  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, entries })
}

/** DELETE /api/case/[ref]/timeline/[id] — ลบ entry */
export async function DELETE(req, { params }) {
  const { ref, id } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { caseRow } = gate

  await deleteTimelineEntry(Number(id), caseRow.id)
  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, entries })
}
