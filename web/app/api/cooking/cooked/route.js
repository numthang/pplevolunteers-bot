import { resolveOwner } from '@/lib/cookingOwner.js'
import { addCooked } from '@/db/cooking/history.js'

export async function POST(req) {
  const { owner } = await resolveOwner()
  const { menu_id } = await req.json()
  if (!menu_id) return Response.json({ error: 'Bad request' }, { status: 400 })

  await addCooked(owner, menu_id)
  return Response.json({ ok: true })
}
