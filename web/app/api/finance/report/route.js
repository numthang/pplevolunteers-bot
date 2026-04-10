import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getCategorySummary, getMonthlyTrend } from '@/db/finance/transactions.js'

const GUILD_ID = process.env.GUILD_ID

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const filter = {
    accountId: p.get('accountId') || undefined,
    type:      p.get('type')      || undefined,
    year:      p.get('year')      || undefined,
    month:     p.get('month')     || undefined,
    dateFrom:  p.get('dateFrom')  || undefined,
    dateTo:    p.get('dateTo')    || undefined,
  }

  const [categories, trend] = await Promise.all([
    getCategorySummary(GUILD_ID, filter),
    getMonthlyTrend(GUILD_ID, { accountId: filter.accountId, type: filter.type, year: filter.year }),
  ])

  return Response.json({ categories, trend })
}
