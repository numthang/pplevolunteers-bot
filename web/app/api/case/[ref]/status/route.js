import { gateCase } from '@/lib/caseGate.js'
import { updateStatus, addTimelineEvents } from '@/db/cases.js'
import { postToThread, caseRefLink } from '@/lib/caseDiscord.js'
import { statusLabel, CASE_REJECT_REASONS, SELECTABLE_STATUSES, NEEDS_PUBLIC_NOTE, NEEDS_REJECT_REASON } from '@/lib/caseOptions.js'
import { logAction } from '@/db/auditLog.js'

// ⛔ `closed` ไม่อยู่ใน SELECTABLE_STATUSES แล้ว = ตั้งใหม่ไม่ได้ (เคสเก่าที่ยังเป็น closed อ่านได้ปกติ)
const VALID_STATUS = SELECTABLE_STATUSES

/** POST /api/case/[ref]/status — เปลี่ยนสถานะ { status, close_reason?, public_note? } */
export async function POST(req, { params }) {
  const { ref } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { session, orgId, caseRow } = gate

  const { status, close_reason, public_note } = await req.json().catch(() => ({}))
  if (!VALID_STATUS.includes(status)) return Response.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 })

  // ⭐ จบเคสทุกทาง (แก้ไขแล้ว/ไม่รับดำเนินการ) ต้องมีข้อความแจ้งผู้ร้องเรียนเสมอ (2026-09-04)
  //    เดิม `resolved` เซฟเงียบไม่ต้องมีอะไรเลย → ผู้ร้องไม่เคยรู้ว่าเคสตัวเองจบแล้วหรือจบยังไง
  //    และ /complaint/[ref] ไม่ได้โชว์ close_reason ด้วย → public note คือช่องทางเดียวจริงๆ
  const needsReason = NEEDS_REJECT_REASON.includes(status)
  if (NEEDS_PUBLIC_NOTE.includes(status)) {
    if (needsReason && (!close_reason || !CASE_REJECT_REASONS.includes(close_reason))) {
      return Response.json({ error: 'กรุณาเลือกเหตุผลที่ไม่รับดำเนินการ' }, { status: 400 })
    }
    if (!public_note?.trim()) {
      return Response.json({ error: 'กรุณาเขียนข้อความแจ้งผู้ร้องเรียน (public note)' }, { status: 400 })
    }
  }

  await updateStatus(caseRow.id, status, needsReason ? close_reason : null)

  if (public_note?.trim()) {
    await addTimelineEvents(caseRow.id, orgId, [{
      body: public_note.trim(),
      is_public: true,
    }], 'human')
  }

  // แจ้งในเธรดของเคส
  if (caseRow.discord_thread_id) {
    const reasonTxt = needsReason ? ` (${close_reason})` : ''
    await postToThread(caseRow.discord_thread_id, `🔄 สถานะเคส ${caseRefLink(caseRow.ref)} → **${statusLabel(status)}**${reasonTxt}`)
  }

  logAction({ orgId, app: 'cases', action: 'case.status_changed', actorId: session.user.userId, targetId: caseRow.ref, meta: { from: caseRow.status, to: status, close_reason: close_reason || null } })

  return Response.json({ ok: true })
}
