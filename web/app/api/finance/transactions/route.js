import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getTransactions, createTransaction } from '@/db/finance/transactions.js'
import { incrementUsageCount as incrementAccount } from '@/db/finance/accounts.js'
import { incrementUsageCount as incrementCategory } from '@/db/finance/categories.js'

const GUILD_ID = process.env.GUILD_ID

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const accountId  = searchParams.get('accountId')
  const type       = searchParams.get('type')
  const categoryId = searchParams.get('categoryId')
  const noCategory = searchParams.get('noCategory')
  const search     = searchParams.get('search')
  const year       = searchParams.get('year')
  const month      = searchParams.get('month')
  const dateFrom   = searchParams.get('dateFrom')
  const dateTo     = searchParams.get('dateTo')
  const limit      = parseInt(searchParams.get('limit') || '50')
  const offset     = parseInt(searchParams.get('offset') || '0')

  // Public transactions visible without auth (when account is public)
  // For simplicity, require auth for API access — page handles public display directly
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await getTransactions(GUILD_ID, { accountId, type, categoryId, noCategory, search, year, month, dateFrom, dateTo, limit, offset })
  return Response.json(rows)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  const id = await createTransaction(GUILD_ID, data, session.user.discordId)
  if (data.account_id)  await incrementAccount(data.account_id)
  if (data.category_id) await incrementCategory(data.category_id)
  return Response.json({ id }, { status: 201 })
}
