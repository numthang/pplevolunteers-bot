import { addItem, listItems } from '@/db/finance/payouts.js'
import { createExternalPayeeFromInput } from '@/lib/externalPayeeInput.js'
import { requireRound } from '../../_guard.js'

/**
 * POST /api/finance/payouts/[id]/payees — สร้างคนนอกใหม่ (พร้อมข้อมูลบัญชี) แล้วใส่เข้ารอบทันที
 *
 * สิทธิ์ = แก้รอบนี้ได้ (ไม่ใช่สิทธิ์ docs) — คนจ่ายเงินหลายคนไม่มีสิทธิ์จัดการเอกสาร
 * เลขประจำตัวซ้ำ → 409 + existing ให้หน้าจอเลือกใช้คนเดิม
 */
export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  try {
    const body = await req.json()
    const r = await createExternalPayeeFromInput(ctx.orgId, ctx.userId, body)
    if (r.error) return Response.json({ error: r.error, existing: r.existing }, { status: r.status })

    await addItem(ctx.orgId, ctx.round.id, {
      external_payee_id: r.data.id,
      amount: ctx.round.default_amount ?? 0,
    })
    return Response.json({ success: true, data: r.data, items: await listItems(ctx.orgId, ctx.round.id) })
  } catch (err) {
    console.error('[POST /api/finance/payouts/:id/payees]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
