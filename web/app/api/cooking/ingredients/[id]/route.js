import { resolveOwner } from '@/lib/cookingOwner.js'
import { deleteIngredient } from '@/db/cooking/ingredients.js'

// ลบ custom ingredient — เฉพาะเจ้าของ
export async function DELETE(_req, { params }) {
  const { id } = await params
  const { owner } = await resolveOwner()
  const ok = await deleteIngredient(owner, id)
  if (!ok) return Response.json({ error: 'ไม่พบ หรือไม่ใช่เจ้าของ' }, { status: 404 })
  return Response.json({ ok: true })
}
