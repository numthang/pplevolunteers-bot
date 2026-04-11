import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getBalanceSummary } from '@/db/finance/transactions.js'

const GUILD_ID = process.env.GUILD_ID

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(req.url).searchParams.get('accountId')
  if (!accountId) return Response.json({ error: 'accountId required' }, { status: 400 })

  const summary = await getBalanceSummary(GUILD_ID, accountId)
  return Response.json(summary)
}
