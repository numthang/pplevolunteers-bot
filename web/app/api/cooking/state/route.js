import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getPantry } from '@/db/cooking/pantry.js'
import { getRecentCooked } from '@/db/cooking/history.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const owner = session.user.discordId
  const [pantry, recentRows] = await Promise.all([
    getPantry(owner),
    getRecentCooked(owner, 3),
  ])

  return Response.json({
    pantry,
    recent: recentRows.map(r => r.menu_id),
  })
}
