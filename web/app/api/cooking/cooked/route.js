import { resolveKitchen } from '@/lib/cookingKitchen.js'
import { addCooked } from '@/db/cooking/history.js'

export async function POST(req) {
  const { kitchenId } = await resolveKitchen()
  const { menu_id } = await req.json()
  if (!menu_id) return Response.json({ error: 'Bad request' }, { status: 400 })

  await addCooked(kitchenId, menu_id)
  return Response.json({ ok: true })
}
