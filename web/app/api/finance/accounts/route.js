import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountsForUser, getAccountsAll, createAccount } from '@/db/finance/accounts.js'
import { isAdmin } from '@/lib/roles.js'

const GUILD_ID = process.env.GUILD_ID

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const all = new URL(req.url).searchParams.get('all')
  const accounts = all
    ? await getAccountsAll(GUILD_ID, session.user.discordId, isAdmin(session.user.roles))
    : await getAccountsForUser(GUILD_ID, session.user.discordId)
  return Response.json(accounts)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  const id = await createAccount(GUILD_ID, data, session.user.discordId)
  return Response.json({ id }, { status: 201 })
}
