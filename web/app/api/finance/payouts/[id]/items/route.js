import { addItem, updateItem, deleteItem, listItems, copyItemsFromRound } from '@/db/finance/payouts.js'
import { requireRound } from '../../_guard.js'

export async function GET(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id, { write: false })
  if (ctx.error) return ctx.error
  return Response.json(await listItems(ctx.orgId, ctx.round.id))
}

export async function POST(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  const body = await req.json()

  // ลอกรายชื่อจากรอบก่อน — รอบเดือนถัดไปกดปุ่มเดียวได้รายชื่อครบ แก้เฉพาะคนที่เปลี่ยน
  if (body.copyFromRoundId) {
    const copied = await copyItemsFromRound(ctx.orgId, ctx.round.id, Number(body.copyFromRoundId))
    return Response.json({ copied, items: await listItems(ctx.orgId, ctx.round.id) })
  }

  const amount = body.amount ?? ctx.round.default_amount
  if (amount == null) return Response.json({ error: 'amount required' }, { status: 400 })

  // XOR — ต้องมาอย่างใดอย่างหนึ่งเท่านั้น (DB มี CHECK ซ้ำอีกชั้น)
  const hasMember = !!body.member_user_id
  const hasPayee  = !!body.external_payee_id
  if (hasMember === hasPayee) return Response.json({ error: 'recipient must be member XOR external' }, { status: 400 })

  const itemId = await addItem(ctx.orgId, ctx.round.id, {
    member_user_id: body.member_user_id || null,
    external_payee_id: body.external_payee_id || null,
    amount,
    note: body.note || null,
  })
  // null = ชนกฎห้ามซ้ำ (คนนี้อยู่ในรอบแล้ว) — ไม่ใช่ error ให้หน้าจอรีเฟรชเฉยๆ
  return Response.json({ id: itemId, duplicate: itemId === null, items: await listItems(ctx.orgId, ctx.round.id) })
}

export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  const { itemId, amount, note, paid } = await req.json()
  if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 })
  await updateItem(ctx.orgId, ctx.round.id, Number(itemId), { amount, note, paid })
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const ctx = await requireRound(id)
  if (ctx.error) return ctx.error

  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 })
  await deleteItem(ctx.orgId, ctx.round.id, Number(itemId))
  return Response.json({ ok: true })
}
