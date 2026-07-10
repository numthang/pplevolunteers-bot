import { resolveOwner } from '@/lib/cookingOwner.js'
import { getPantry } from '@/db/cooking/pantry.js'
import { getRecentCooked } from '@/db/cooking/history.js'

export async function GET() {
  const { owner, isAnon } = await resolveOwner()
  const [pantry, recentRows] = await Promise.all([
    getPantry(owner),
    getRecentCooked(owner, 3),
  ])

  return Response.json({
    pantry,
    recent: recentRows.map(r => r.menu_id),
    isAnon,
  })
}
