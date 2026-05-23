import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { deleteFund } from '@/db/finance/funds.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import pool from '@/db/index.js'

export async function DELETE(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [[fund]] = await pool.query(`SELECT account_id FROM finance_funds WHERE id = ?`, [id])
  if (!fund) return Response.json({ error: 'Not found' }, { status: 404 })

  const { roles, discordId } = await getEffectiveIdentity(session)
  const account = await getAccountById(fund.account_id)
  if (!account || !canEditAccount(account, discordId, roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await deleteFund(id)
  return Response.json({ ok: true })
}
