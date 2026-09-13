import { listRounds, createRound } from '@/db/finance/payouts.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canEditAccount, canViewAccount } from '@/lib/financeAccess.js'
import { requireSession } from './_guard.js'

export async function GET() {
  const ctx = await requireSession()
  if (ctx.error) return ctx.error

  const rounds = await listRounds(ctx.orgId)
  // กรองด้วยสิทธิ์ของบัญชีต้นทาง — เห็นเฉพาะรอบของบัญชีที่ตัวเองเห็น
  const visible = []
  for (const r of rounds) {
    const account = await getAccountById(ctx.orgId, r.account_id)
    if (account && canViewAccount(account, ctx.userId, ctx.access)) visible.push(r)
  }
  return Response.json(visible)
}

export async function POST(req) {
  const ctx = await requireSession()
  if (ctx.error) return ctx.error

  const data = await req.json()
  if (!data?.title?.trim())  return Response.json({ error: 'title required' }, { status: 400 })
  if (!data?.account_id)     return Response.json({ error: 'account_id required' }, { status: 400 })

  // ห้าม trust org จาก body — scope = active org เสมอ (cross-org write hole เดิมของ accounts)
  const account = await getAccountById(ctx.orgId, Number(data.account_id))
  if (!account) return Response.json({ error: 'account not found' }, { status: 404 })
  if (!canEditAccount(account, ctx.userId, ctx.access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sourceType = data.source_type === 'period' ? 'period' : 'event'
  if (sourceType === 'event'  && !data.event_id)  return Response.json({ error: 'event required' }, { status: 400 })
  if (sourceType === 'period' && !data.period_ym) return Response.json({ error: 'period required' }, { status: 400 })

  const id = await createRound(ctx.orgId, { ...data, source_type: sourceType }, ctx.userId)
  return Response.json({ id }, { status: 201 })
}
