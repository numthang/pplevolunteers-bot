import { updateMenu, deleteMenu } from '@/db/cooking/menus.js'
import { normalizeMenuInput } from '@/lib/cookingMenu.js'
import { resolveOwner } from '@/lib/cookingOwner.js'

// แก้เมนู — ใครที่ login แล้วก็แก้ได้ (public wiki เดียว ไม่มีเจ้าของแล้ว แต่ต้อง login กันคนแปลกหน้าป่วน)
export async function PATCH(req, { params }) {
  const { isAnon } = await resolveOwner()
  if (isAnon) return Response.json({ error: 'ต้อง login ก่อนถึงจะแก้เมนูได้' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const { menu, error } = normalizeMenuInput(body)
  if (error) return Response.json({ error }, { status: 400 })

  const saved = await updateMenu(id, menu)
  if (!saved) return Response.json({ error: 'ไม่พบเมนู' }, { status: 404 })
  const { owner: _o, ...rest } = saved
  return Response.json({ menu: rest })
}

// ลบเมนู — ต้อง login เหมือนกัน
export async function DELETE(_req, { params }) {
  const { isAnon } = await resolveOwner()
  if (isAnon) return Response.json({ error: 'ต้อง login ก่อนถึงจะลบเมนูได้' }, { status: 401 })

  const { id } = await params
  const ok = await deleteMenu(id)
  if (!ok) return Response.json({ error: 'ไม่พบเมนู' }, { status: 404 })
  return Response.json({ ok: true })
}
