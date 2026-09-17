import { isEditableExternalPayeeInRound, listItems } from '@/db/finance/payouts.js'
import { updateExternalPayee, BANK_FIELDS } from '@/db/docs/externalPayees.js'
import { requireRound } from '../../../_guard.js'

/**
 * PATCH /api/finance/payouts/[id]/payees/[payeeId] — ใส่/แก้ข้อมูลบัญชีของคนนอกจากหน้ารอบจ่าย
 *
 * แก้ได้เฉพาะช่องรับเงิน และเฉพาะคนที่อยู่ในรอบนี้ — สิทธิ์การเงินไม่ควรเปิดทะเบียนคนนอกทั้งก้อน
 * (ชื่อ/ที่อยู่/เลขบัตรยังแก้ที่ Docs เท่านั้น)
 */
export async function PATCH(req, { params }) {
  const { id, payeeId } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  const pid = Number(payeeId)
  if (!(await isEditableExternalPayeeInRound(ctx.orgId, ctx.round.id, pid))) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const patch = Object.fromEntries(BANK_FIELDS.filter(f => body[f] !== undefined).map(f => [f, body[f]]))
  const updated = await updateExternalPayee(pid, ctx.orgId, patch)
  if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true, items: await listItems(ctx.orgId, ctx.round.id) })
}
