import { resolveOwner } from '@/lib/cookingOwner.js'
import { isMember, removeMember } from '@/db/cooking/kitchens.js'

// ลบสมาชิกออกจากครัว (หรือ "ออกจากครัว" ถ้าลบตัวเอง) — ต้องเป็นสมาชิกก่อนถึงจะทำได้
// กันลบสมาชิกคนสุดท้าย — removeMember() คืน false ถ้าครัวจะเหลือ 0 คน
export async function DELETE(_req, { params }) {
  const { id, member } = await params
  const kitchenId = Number(id)
  const { owner } = await resolveOwner()
  const ok = await isMember(kitchenId, owner)
  if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const removed = await removeMember(kitchenId, decodeURIComponent(member))
  if (!removed) {
    return Response.json({ error: 'ลบไม่ได้ — ครัวต้องมีสมาชิกอย่างน้อย 1 คน' }, { status: 400 })
  }
  return Response.json({ ok: true })
}
