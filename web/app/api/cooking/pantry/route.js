import { resolveOwner } from '@/lib/cookingOwner.js'
import { setPantry, clearPantry } from '@/db/cooking/pantry.js'

export async function POST(req) {
  const { owner } = await resolveOwner()
  const { token, status } = await req.json()
  if (!token || !['have', 'out', 'clear'].includes(status)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }

  if (status === 'clear') {
    await clearPantry(owner, token)
  } else {
    await setPantry(owner, token, status)
  }

  return Response.json({ ok: true })
}
