import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getBalanceSummary } from '@/db/finance/transactions.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canViewAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const accountId = new URL(req.url).searchParams.get('accountId')
  if (!accountId) return Response.json({ error: 'accountId required' }, { status: 400 })

  const { userId: effectiveUserId, access } = await getEffectiveIdentity(session)
  const ORG_ID = await getOrgId(session)
  const account = await getAccountById(accountId)
  if (!account || !canViewAccount(account, effectiveUserId, access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const summary = await getBalanceSummary(ORG_ID, accountId)
  return Response.json(summary)
}
