import { resolveOwner } from '@/lib/cookingOwner.js'
import { isMember, renameKitchen } from '@/db/cooking/kitchens.js'

// เปลี่ยนชื่อครัว — ต้องเป็นสมาชิกครัวนั้นก่อน (สมาชิกทุกคนสิทธิ์เท่ากัน ไม่มี role)
export async function PATCH(req, { params }) {
  const { id } = await params
  const kitchenId = Number(id)
  const { owner } = await resolveOwner()
  const ok = await isMember(kitchenId, owner)
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json().catch(() => ({}))
  const trimmed = name?.trim()
  if (!trimmed) return Response.json({ error: 'ต้องมีชื่อครัว' }, { status: 400 })

  const kitchen = await renameKitchen(kitchenId, trimmed)
  if (!kitchen) return Response.json({ error: 'ไม่พบครัว' }, { status: 404 })
  return Response.json({ kitchen })
}
