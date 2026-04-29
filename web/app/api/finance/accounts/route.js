import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountsAll, createAccount } from '@/db/finance/accounts.js'
import { isAdmin } from '@/lib/roles.js'
import { canViewAccount, canCreateNonPrivateAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'

const GUILD_ID = process.env.GUILD_ID

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles, discordId } = await getEffectiveIdentity(session)
  const all = new URL(req.url).searchParams.get('all')
  const raw = await getAccountsAll(GUILD_ID, discordId, roles.includes('Admin'))
  const accounts = raw.filter(a => canViewAccount(a, discordId, roles))
  return Response.json(accounts)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles } = await getEffectiveIdentity(session)
  const data = await req.json()
  if (!canCreateNonPrivateAccount(roles)) data.visibility = 'private'

  const guildId = (isAdmin(roles) && data.guild_id) ? data.guild_id : GUILD_ID
  const id = await createAccount(guildId, data, session.user.discordId)
  return Response.json({ id }, { status: 201 })
}
