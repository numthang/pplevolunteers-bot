import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountsAll, createAccount } from '@/db/finance/accounts.js'
import { isAdmin } from '@/lib/roles.js'
import { can } from '@/lib/permissions.js'
import { canViewAccount, canCreateNonPrivateAccount } from '@/lib/financeAccess.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, access } = await getEffectiveOrgIdentity(session)
  const ORG_ID = await getOrgId(session)
  const all = new URL(req.url).searchParams.get('all')
  const raw = await getAccountsAll(ORG_ID, userId, can('viewPrivateOther', access.permissions))
  const accounts = raw.filter(a => canViewAccount(a, userId, access))
  return Response.json(accounts)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  const ORG_ID = await getOrgId(session)
  const data = await req.json()
  if (!canCreateNonPrivateAccount(access)) data.visibility = 'private'

  const orgId = (isAdmin(access) && data.org_id) ? data.org_id : ORG_ID
  const id = await createAccount(orgId, data, session.user.userId)
  return Response.json({ id }, { status: 201 })
}
