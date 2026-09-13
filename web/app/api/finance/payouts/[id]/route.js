import { updateRound, deleteRound, setRoundStatus, listItems } from '@/db/finance/payouts.js'
import { requireRound } from '../_guard.js'

export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id, { write: false })
  if (ctx.error) return ctx.error

  const items = await listItems(ctx.orgId, ctx.round.id)
  return Response.json({ round: ctx.round, account: ctx.account, items })
}

export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  const data = await req.json()

  // มาร์ค "จ่ายแล้ว" — ไม่แตะ finance_transactions (ขั้นนี้ระบบทำหน้าที่กันจ่ายซ้ำ + รู้ว่ารอบไหนค้าง)
  if (data.status) {
    if (!['draft', 'exported', 'paid'].includes(data.status)) {
      return Response.json({ error: 'bad status' }, { status: 400 })
    }
    await setRoundStatus(ctx.orgId, ctx.round.id, data.status)
    return Response.json({ ok: true })
  }

  await updateRound(ctx.orgId, ctx.round.id, data)
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  await deleteRound(ctx.orgId, ctx.round.id)
  return Response.json({ ok: true })
}
