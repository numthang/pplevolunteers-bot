import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountsAll, createAccount } from '@/db/finance/accounts.js'
import { isAdmin } from '@/lib/roles.js'
import { canViewAccount, canCreateNonPrivateAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles, discordId, access } = await getEffectiveIdentity(session)
  const GUILD_ID = await getGuildId(session)
  const all = new URL(req.url).searchParams.get('all')
  const raw = await getAccountsAll(GUILD_ID, discordId, roles.includes('Admin'))
  const accounts = raw.filter(a => canViewAccount(a, discordId, access))
  return Response.json(accounts)
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles, access } = await getEffectiveIdentity(session)
  const GUILD_ID = await getGuildId(session)
  const data = await req.json()
  if (!canCreateNonPrivateAccount(access)) data.visibility = 'private'

  const guildId = (isAdmin(roles) && data.guild_id) ? data.guild_id : GUILD_ID
  const id = await createAccount(guildId, data, session.user.discordId)
  return Response.json({ id }, { status: 201 })
}
