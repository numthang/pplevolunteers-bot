import { updateMenu, deleteMenu } from '@/db/cooking/menus.js'
import { resolveOwner } from '@/lib/cookingOwner.js'
import { normalizeMenuInput } from '@/lib/cookingMenu.js'

// แก้เมนู — เฉพาะเจ้าของ (updateMenu มี WHERE owner = $) · seed (owner NULL) แก้ไม่ได้
export async function PATCH(req, { params }) {
  const { id } = await params
  const { owner } = await resolveOwner()
  const body = await req.json().catch(() => null)
  const { menu, error } = normalizeMenuInput(body)
  if (error) return Response.json({ error }, { status: 400 })

  const saved = await updateMenu(id, owner, menu)
  if (!saved) return Response.json({ error: 'ไม่พบเมนู หรือไม่ใช่เจ้าของ' }, { status: 404 })
  const { owner: _o, ...rest } = saved
  return Response.json({ menu: { ...rest, mine: true, by: 'ฉัน' } })
}

// ลบเมนู — เฉพาะเจ้าของ
export async function DELETE(_req, { params }) {
  const { id } = await params
  const { owner } = await resolveOwner()
  const ok = await deleteMenu(id, owner)
  if (!ok) return Response.json({ error: 'ไม่พบเมนู หรือไม่ใช่เจ้าของ' }, { status: 404 })
  return Response.json({ ok: true })
}
