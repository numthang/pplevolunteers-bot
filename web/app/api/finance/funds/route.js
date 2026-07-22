import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getFunds, createFund, getFundBalances } from '@/db/finance/funds.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canViewAccount, canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  if (!accountId) return Response.json({ error: 'accountId required' }, { status: 400 })

  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, access } = await getEffectiveOrgIdentity(session)
  const account = await getAccountById(orgId, accountId)
  if (!account || !canViewAccount(account, userId, access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (searchParams.get('balances') === '1') {
    return Response.json(await getFundBalances(accountId))
  }
  return Response.json(await getFunds(accountId))
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId, name } = await req.json()
  if (!accountId || !name?.trim()) {
    return Response.json({ error: 'accountId and name required' }, { status: 400 })
  }

  const orgId = await getOrgId(session)
  if (!orgId) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, access } = await getEffectiveOrgIdentity(session)
  const account = await getAccountById(orgId, accountId)
  if (!account || !canEditAccount(account, userId, access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const id = await createFund(accountId, name.trim())
  return Response.json({ id }, { status: 201 })
}
