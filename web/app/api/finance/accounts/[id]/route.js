import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getAccountById, updateAccount, deleteAccount } from '@/db/finance/accounts.js'
import { canEditAccount } from '@/lib/roles.js'

export async function PUT(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await getAccountById(id)
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  const isOwner = account.owner_id === session.user.discordId
  if (!isOwner && !canEditAccount(session.user.roles, account)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await req.json()
  await updateAccount(id, data, session.user.discordId)
  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await getAccountById(id)
  if (!account) return Response.json({ error: 'Not found' }, { status: 404 })

  const isOwner = account.owner_id === session.user.discordId
  if (!isOwner && !canEditAccount(session.user.roles, account)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteAccount(id)
  return Response.json({ ok: true })
}
