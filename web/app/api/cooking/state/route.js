import { resolveKitchen } from '@/lib/cookingKitchen.js'
import { getPantry } from '@/db/cooking/pantry.js'
import { getRecentCooked } from '@/db/cooking/history.js'

export async function GET() {
  const { kitchenId, isAnon } = await resolveKitchen()
  const [pantry, recentRows] = await Promise.all([
    getPantry(kitchenId),
    getRecentCooked(kitchenId, 3),
  ])

  return Response.json({
    pantry,
    recent: recentRows.map(r => r.menu_id),
    isAnon,
    kitchenId,
  })
}
