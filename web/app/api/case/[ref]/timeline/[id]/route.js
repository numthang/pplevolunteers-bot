import { gateCase } from '@/lib/caseGate.js'
import { getTimelineEntry, toggleTimelinePublic, deleteTimelineEntry, getTimeline } from '@/db/cases.js'
import { logAction } from '@/db/auditLog.js'

/** PATCH /api/case/[ref]/timeline/[id] — toggle is_public */
export async function PATCH(req, { params }) {
  const { ref, id } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { caseRow } = gate

  const { is_public } = await req.json().catch(() => ({}))
  await toggleTimelinePublic(Number(id), caseRow.id, !!is_public)
  logAction({ guildId: gate.guildId, app: 'cases', action: 'case.timeline_toggled', actorId: gate.session.user.discordId, targetId: caseRow.ref, meta: { entryId: Number(id), is_public: !!is_public } })
  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, entries })
}

/** DELETE /api/case/[ref]/timeline/[id] — ลบ entry */
export async function DELETE(req, { params }) {
  const { ref, id } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { caseRow } = gate

  const deleted = await getTimelineEntry(Number(id), caseRow.id)
  await deleteTimelineEntry(Number(id), caseRow.id)
  logAction({ guildId: gate.guildId, app: 'cases', action: 'case.timeline_deleted', actorId: gate.session.user.discordId, targetId: caseRow.ref, meta: { entryId: Number(id), old_value: deleted ? { body: deleted.body, is_public: deleted.is_public } : null } })
  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, entries })
}
