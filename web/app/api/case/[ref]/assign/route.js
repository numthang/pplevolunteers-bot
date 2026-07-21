import { gateCase } from '@/lib/caseGate.js'
import { addAssignee, removeAssignee, getAssignees } from '@/db/cases.js'
import { postToThread } from '@/lib/caseDiscord.js'
import { logAction } from '@/db/auditLog.js'
import { userIdByDiscord } from '@/db/guilds.js'

/** POST /api/case/[ref]/assign — รับเรื่อง (default = ตัวเอง) หรือ assign คนอื่น { discordId } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  let discordId = session.user.discordId
  let userId = session.user.userId
  try {
    const body = await req.json().catch(() => ({}))
    if (body.discordId) {
      discordId = String(body.discordId)
      userId = await userIdByDiscord(discordId)
    }
  } catch { /* default self */ }

  await addAssignee(caseRow.id, orgId, userId)

  // ping ผู้รับผิดชอบทุกคนในเธรดของเคส
  if (caseRow.discord_thread_id) {
    const assignees = await getAssignees(caseRow.id)
    const mentions = assignees.map(a => `<@${a.discord_id}>`).join(' ')
    await postToThread(caseRow.discord_thread_id, `👤 ผู้รับผิดชอบเคส **${caseRow.ref}**: ${mentions}`)
  }

  logAction({ orgId, app: 'cases', action: 'case.assigned', actorId: session.user.userId, targetId: caseRow.ref, meta: { assignedTo: discordId } })

  return Response.json({ ok: true })
}

/** DELETE /api/case/[ref]/assign — ถอนตัว (default = ตัวเอง) หรือถอนคนอื่น { discordId } */
export async function DELETE(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  let discordId = session.user.discordId
  let userId = session.user.userId
  try {
    const body = await req.json().catch(() => ({}))
    if (body.discordId) {
      discordId = String(body.discordId)
      userId = await userIdByDiscord(discordId)
    }
  } catch { /* default self */ }

  await removeAssignee(caseRow.id, userId)

  logAction({ orgId, app: 'cases', action: 'case.unassigned', actorId: session.user.userId, targetId: caseRow.ref, meta: { removedFrom: discordId } })

  return Response.json({ ok: true })
}
