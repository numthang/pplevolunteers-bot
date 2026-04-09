import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategories, createCategory } from '@/db/finance/categories.js'

const GUILD_ID = process.env.GUILD_ID

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await getCategories(GUILD_ID)
  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })

  const id = await createCategory(GUILD_ID, name.trim())
  return Response.json({ id }, { status: 201 })
}
