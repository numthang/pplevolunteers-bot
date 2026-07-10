import { resolveOwner } from '@/lib/cookingOwner.js'
import { getIngredients, addIngredient } from '@/db/cooking/ingredients.js'

const GROUPS = ['protein', 'veg', 'special']

export async function GET() {
  const { owner } = await resolveOwner()
  const ingredients = await getIngredients(owner)
  return Response.json({ ingredients })
}

export async function POST(req) {
  const { owner } = await resolveOwner()
  const body = await req.json().catch(() => null)
  const token = body?.token?.trim()
  const label = body?.label?.trim()
  const grp = body?.grp

  if (!token || !label || !GROUPS.includes(grp)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  const row = await addIngredient(owner, { token, label, grp })
  if (!row) return Response.json({ error: 'มีอยู่แล้ว' }, { status: 409 })
  return Response.json({ ingredient: row }, { status: 201 })
}
