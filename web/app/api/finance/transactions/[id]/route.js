import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getTransactionById, updateTransaction, deleteTransaction } from '@/db/finance/transactions.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { incrementUsageCount as incrementCategory } from '@/db/finance/categories.js'
import { canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'

export async function PUT(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const txn = await getTransactionById(id)
  if (!txn) return Response.json({ error: 'Not found' }, { status: 404 })

  const account = await getAccountById(txn.account_id)
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = await getEffectiveIdentity(session)
  if (!account || !canEditAccount(account, effectiveDiscordId, effectiveRoles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const data = await req.json()
  await updateTransaction(id, data, session.user.discordId)

  if (data.category_id && String(data.category_id) !== String(txn.category_id)) {
    await incrementCategory(data.category_id)
  }

  return Response.json({ ok: true })
}

export async function DELETE(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const txn = await getTransactionById(id)
  if (!txn) return Response.json({ error: 'Not found' }, { status: 404 })

  const account = await getAccountById(txn.account_id)
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = await getEffectiveIdentity(session)
  if (!account || !canEditAccount(account, effectiveDiscordId, effectiveRoles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteTransaction(id)
  return Response.json({ ok: true })
}
