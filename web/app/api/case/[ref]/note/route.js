import { gateCase } from '@/lib/caseGate.js'
import { addNote } from '@/db/cases.js'

/** POST /api/case/[ref]/note — เพิ่มโน้ต { body, is_public } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, guildId, caseRow } = gate

  const { body, is_public } = await req.json().catch(() => ({}))
  if (!body?.trim()) return Response.json({ error: 'กรุณาใส่ข้อความ' }, { status: 400 })

  const note = await addNote(caseRow.id, guildId, {
    author_discord_id: session.user.discordId,
    body: body.trim(),
    is_public: !!is_public,
  })

  return Response.json({ ok: true, note })
}
