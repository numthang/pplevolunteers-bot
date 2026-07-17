import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountsAll, createAccount } from '@/db/finance/accounts.js'
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

  // scope = active org เสมอ · ห้าม trust data.org_id (เดิม admin guild-picker ที่ลบ UI ไปแล้ว)
  // owner=superuser ทำให้ isAdmin true → ถ้า trust body org_id = เขียนข้าม tenant ได้ (cross-org write hole)
  const id = await createAccount(ORG_ID, data, session.user.userId)
  return Response.json({ id }, { status: 201 })
}
