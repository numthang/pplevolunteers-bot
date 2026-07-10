import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { addCooked } from '@/db/cooking/history.js'

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const owner = session.user.discordId
  const { menu_id } = await req.json()
  if (!menu_id) return Response.json({ error: 'Bad request' }, { status: 400 })

  await addCooked(owner, menu_id)
  return Response.json({ ok: true })
}
