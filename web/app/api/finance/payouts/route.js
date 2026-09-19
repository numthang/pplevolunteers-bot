import { listRounds, listItemsForRounds, createRound } from '@/db/finance/payouts.js'
import { getAccountById } from '@/db/finance/accounts.js'
import { canEditAccount, canViewAccount } from '@/lib/financeAccess.js'
import { unreachableReason } from '@/lib/payoutNotify.js'
import { requireSession } from './_guard.js'

/**
 * เติมตัวเลขการแจ้ง DM ให้รอบที่ export แล้ว — ป้ายสถานะบนการ์ดคำนวณจากตรงนี้ (lib/payoutStage.js)
 *
 * ดึงเฉพาะรอบ 'exported': ร่างยังไม่ต้องรู้ และรอบที่ปิดแล้วโชว์ "ปิดรอบแล้ว" อย่างเดียวอยู่แล้ว
 * → รอบเก่าที่สะสมไปเรื่อยๆ ไม่ถูกดึงรายการขึ้นมาทุกครั้งที่เปิดหน้า list
 */
async function withNotifyCounts(orgId, rounds) {
  const ids = rounds.filter(r => r.status === 'exported').map(r => r.id)
  if (!ids.length) return rounds

  const items = await listItemsForRounds(orgId, ids)
  const stats = new Map(ids.map(id => [id, { notifiable: 0, notified: 0 }]))
  for (const it of items) {
    const s = stats.get(it.round_id)
    if (!s || unreachableReason(it)) continue      // คนนอก/ไม่ผูก Discord/ไม่มีเลขบัญชี = DM ไม่ถึง
    s.notifiable++
    if (it.notified_at) s.notified++
  }

  return rounds.map(r => {
    const s = stats.get(r.id)
    return s ? { ...r, notifiable_count: s.notifiable, notified_count: s.notified } : r
  })
}

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
  return Response.json(await withNotifyCounts(ctx.orgId, visible))
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
