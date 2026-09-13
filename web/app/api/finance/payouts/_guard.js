import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canEditAccount, canViewAccount } from '@/lib/financeAccess.js'
import { getRoundById } from '@/db/finance/payouts.js'

/**
 * สิทธิ์รอบจ่าย = สิทธิ์ของ "บัญชีต้นทาง" ที่รอบผูกอยู่ (เคาะ 2026-09-13)
 * คนจ่ายแยกตามเขต/จังหวัด → canEditAccount ไล่ scope ให้แล้ว ไม่ต้องมี ACL ชุดที่สอง
 */
export async function requireSession() {
  const session = await getServerSession(authOptions)
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { userId, access } = await getEffectiveOrgIdentity(session)
  const orgId = await getOrgId(session)
  return { session, userId, access, orgId }
}

/** โหลดรอบ + บัญชีต้นทาง แล้วเช็คสิทธิ์ในจังหวะเดียว */
export async function requireRound(id, { write = true } = {}) {
  const ctx = await requireSession()
  if (ctx.error) return ctx

  const round = await getRoundById(ctx.orgId, Number(id))
  if (!round) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }

  const account = await getAccountById(ctx.orgId, round.account_id)
  const ok = write ? canEditAccount(account, ctx.userId, ctx.access)
                   : canViewAccount(account, ctx.userId, ctx.access)
  if (!ok) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  // รอบที่จ่ายแล้ว = ปิดบัญชีไปแล้ว ห้ามแก้ย้อนหลัง (ยอดที่โอนจริงต้องตรงกับที่บันทึกไว้)
  if (write && round.status === 'paid') {
    return { error: Response.json({ error: 'Round already paid' }, { status: 409 }) }
  }

  return { ...ctx, round, account }
}
