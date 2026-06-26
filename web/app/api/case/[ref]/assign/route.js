import { gateCase } from '@/lib/caseGate.js'
import { addAssignee, getAssignees } from '@/db/cases.js'
import { postToThread } from '@/lib/caseDiscord.js'

/** POST /api/case/[ref]/assign — รับเรื่อง (default = ตัวเอง) หรือ assign คนอื่น { discordId } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, guildId, caseRow } = gate

  let discordId = session.user.discordId
  try {
    const body = await req.json().catch(() => ({}))
    if (body.discordId) discordId = String(body.discordId)
  } catch { /* default self */ }

  await addAssignee(caseRow.id, guildId, discordId)

  // ping ผู้รับผิดชอบทุกคนในเธรดของเคส
  if (caseRow.discord_thread_id) {
    const assignees = await getAssignees(caseRow.id)
    const mentions = assignees.map(a => `<@${a.discord_id}>`).join(' ')
    await postToThread(caseRow.discord_thread_id, `👤 ผู้รับผิดชอบเคส **${caseRow.ref}**: ${mentions}`)
  }

  return Response.json({ ok: true })
}
