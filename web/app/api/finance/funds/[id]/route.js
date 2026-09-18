import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { deleteFund, getFundById, updateFund } from '@/db/finance/funds.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { checkFundRange } from '@/lib/fundRange.js'

// โหลดกอง + เช็คสิทธิ์แก้บัญชีเจ้าของกอง · คืน { fund } หรือ { error: Response }
async function loadEditableFund(id) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const fund = await getFundById(id)
  if (!fund) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }

  const orgId = await getOrgId(session)
  if (!orgId) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  const { userId, access } = await getEffectiveOrgIdentity(session)
  const account = await getAccountById(orgId, fund.account_id)
  if (!account || !canEditAccount(account, userId, access)) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { fund }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  const { fund, error } = await loadEditableFund(id)
  if (error) return error

  const { name, startsAt, endsAt } = await req.json()
  if (!name?.trim()) return Response.json({ error: 'name required' }, { status: 400 })

  const range = await checkFundRange(fund.account_id, { startsAt, endsAt }, fund.id)
  if (range.error) return range.error

  await updateFund(fund.id, { name: name.trim(), ...range })
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const { fund, error } = await loadEditableFund(id)
  if (error) return error

  await deleteFund(fund.id)
  return Response.json({ ok: true })
}
