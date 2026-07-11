import { deleteIngredient, updateIngredient } from '@/db/cooking/ingredients.js'

const GROUPS = ['protein', 'veg', 'starch', 'dairy', 'seasoning']

// แก้ label/grp ของ ingredient — ใครก็แก้ได้ (public wiki, token คงเดิม)
export async function PATCH(req, { params }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  const label = body?.label?.trim()
  const grp = body?.grp
  if (!label || !GROUPS.includes(grp)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const row = await updateIngredient(id, { label, grp })
  if (!row) return Response.json({ error: 'ไม่พบ' }, { status: 404 })
  return Response.json({ ingredient: row })
}

// ลบ ingredient — ใครก็ลบได้
export async function DELETE(_req, { params }) {
  const { id } = await params
  const ok = await deleteIngredient(id)
  if (!ok) return Response.json({ error: 'ไม่พบ' }, { status: 404 })
  return Response.json({ ok: true })
}
