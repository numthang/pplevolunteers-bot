import { gateCase } from '@/lib/caseGate.js'
import { addTimelineEvents, getTimeline } from '@/db/cases.js'

/** GET /api/case/[ref]/timeline — โหลด timeline ทั้งหมด (สำหรับ manage page) */
export async function GET(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { caseRow } = gate
  const entries = await getTimeline(caseRow.id)
  return Response.json({ entries })
}

/** POST /api/case/[ref]/timeline — เพิ่ม timeline entry แบบ manual { body, is_public, occurred_at? } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { guildId, caseRow } = gate

  const { body, is_public, occurred_at } = await req.json().catch(() => ({}))
  if (!body?.trim()) return Response.json({ error: 'กรุณาใส่ข้อความ' }, { status: 400 })

  await addTimelineEvents(caseRow.id, guildId, [
    { body: body.trim(), is_public: !!is_public, occurred_at: occurred_at || null },
  ], 'human')

  const entries = await getTimeline(caseRow.id)
  return Response.json({ ok: true, entries })
}
