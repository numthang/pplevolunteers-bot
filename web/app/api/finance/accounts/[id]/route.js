import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountById, updateAccount, deleteAccount, archiveAccount } from '@/db/finance/accounts.js'
import { canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'

async function checkEditPermission(session, id) {
  const account = await getAccountById(id)
  if (!account) return { error: 'Not found', status: 404 }
  const { roles, discordId } = await getEffectiveIdentity(session)
  if (!canEditAccount(account, discordId, roles)) return { error: 'Forbidden', status: 403 }
  return { account }
}

export async function PUT(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, status, account } = await checkEditPermission(session, id)
  if (error) return Response.json({ error }, { status })

  const data = await req.json()
  await updateAccount(id, data, session.user.discordId)
  return Response.json({ ok: true })
}

export async function PATCH(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, status } = await checkEditPermission(session, id)
  if (error) return Response.json({ error }, { status })

  const { archived } = await req.json()
  await archiveAccount(id, archived)
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { error, status } = await checkEditPermission(session, id)
  if (error) return Response.json({ error }, { status })

  await deleteAccount(id)
  return Response.json({ ok: true })
}
