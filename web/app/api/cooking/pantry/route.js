import { resolveKitchen } from '@/lib/cookingKitchen.js'
import { setPantry, clearPantry } from '@/db/cooking/pantry.js'

export async function POST(req) {
  const { kitchenId } = await resolveKitchen()
  const { token, status } = await req.json()
  if (!token || !['have', 'out', 'clear'].includes(status)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  if (status === 'clear') {
    await clearPantry(kitchenId, token)
  } else {
    await setPantry(kitchenId, token, status)
  }

  return Response.json({ ok: true })
}
