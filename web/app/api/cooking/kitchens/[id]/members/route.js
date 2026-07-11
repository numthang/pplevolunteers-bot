import { resolveOwner } from '@/lib/cookingOwner.js'
import { isMember, addMember, getMembers } from '@/db/cooking/kitchens.js'

// รายชื่อสมาชิกครัว — ต้องเป็นสมาชิกก่อนถึงจะดูได้
export async function GET(_req, { params }) {
  const { id } = await params
  const kitchenId = Number(id)
  const { owner } = await resolveOwner()
  const ok = await isMember(kitchenId, owner)
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const members = await getMembers(kitchenId)
  return Response.json({ members })
}

// เชิญสมาชิกใหม่ด้วย Discord ID — สมาชิกคนไหนก็เชิญได้ (ไม่มี role)
export async function POST(req, { params }) {
  const { id } = await params
  const kitchenId = Number(id)
  const { owner } = await resolveOwner()
  const ok = await isMember(kitchenId, owner)
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { discordId } = await req.json().catch(() => ({}))
  const trimmed = discordId?.trim()
  if (!trimmed) return Response.json({ error: 'ต้องใส่ Discord ID' }, { status: 400 })

  await addMember(kitchenId, trimmed)
  const members = await getMembers(kitchenId)
  return Response.json({ members }, { status: 201 })
}
