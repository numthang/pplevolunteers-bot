import { gateCase } from '@/lib/caseGate.js'
import { updateStatus, addTimelineEvents } from '@/db/cases.js'
import { postToThread } from '@/lib/caseDiscord.js'
import { statusLabel, CASE_CLOSE_REASONS } from '@/lib/caseOptions.js'
import { logAction } from '@/db/auditLog.js'

const VALID_STATUS = ['open', 'in_progress', 'resolved', 'closed', 'rejected']
const NEEDS_REASON = ['closed', 'rejected']

/** POST /api/case/[ref]/status — เปลี่ยนสถานะ { status, close_reason?, public_note? } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, guildId, orgId, caseRow } = gate

  const { status, close_reason, public_note } = await req.json().catch(() => ({}))
  if (!VALID_STATUS.includes(status)) return Response.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })

  // ปิด/ไม่รับ → ต้องมีเหตุผล + public note อธิบายให้ผู้ร้องเรียน
  if (NEEDS_REASON.includes(status)) {
    if (!close_reason || !CASE_CLOSE_REASONS.includes(close_reason)) {
      return Response.json({ error: 'กรุณาเลือกเหตุผลในการปิดเรื่อง' }, { status: 400 })
    }
    if (!public_note?.trim()) {
      return Response.json({ error: 'กรุณาเขียนข้อความแจ้งผู้ร้องเรียน (public note)' }, { status: 400 })
    }
  }

  await updateStatus(caseRow.id, status, NEEDS_REASON.includes(status) ? close_reason : null)

  if (public_note?.trim()) {
    await addTimelineEvents(caseRow.id, guildId, [{
      body: public_note.trim(),
      is_public: true,
    }], 'human')
  }

  // แจ้งในเธรดของเคส
  if (caseRow.discord_thread_id) {
    const reasonTxt = NEEDS_REASON.includes(status) ? ` (${close_reason})` : ''
    await postToThread(caseRow.discord_thread_id, `🔄 สถานะเคส **${caseRow.ref}** → **${statusLabel(status)}**${reasonTxt}`)
  }

  logAction({ orgId, app: 'cases', action: 'case.status_changed', actorId: session.user.userId, targetId: caseRow.ref, meta: { from: caseRow.status, to: status, close_reason: close_reason || null } })

  return Response.json({ ok: true })
}
