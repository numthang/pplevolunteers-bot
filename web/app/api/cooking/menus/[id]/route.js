import { updateMenu, deleteMenu } from '@/db/cooking/menus.js'
import { normalizeMenuInput } from '@/lib/cookingMenu.js'

// แก้เมนู — ใครก็แก้ได้ (public wiki เดียว ไม่มีเจ้าของแล้ว)
export async function PATCH(req, { params }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const { menu, error } = normalizeMenuInput(body)
  if (error) return Response.json({ error }, { status: 400 })

  const saved = await updateMenu(id, menu)
  if (!saved) return Response.json({ error: 'ไม่พบเมนู' }, { status: 404 })
  const { owner: _o, ...rest } = saved
  return Response.json({ menu: rest })
}

// ลบเมนู — ใครก็ลบได้
export async function DELETE(_req, { params }) {
  const { id } = await params
  const ok = await deleteMenu(id)
  if (!ok) return Response.json({ error: 'ไม่พบเมนู' }, { status: 404 })
  return Response.json({ ok: true })
}
