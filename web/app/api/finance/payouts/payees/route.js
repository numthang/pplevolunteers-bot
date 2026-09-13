import { searchPayees } from '@/db/finance/payouts.js'
import { requireSession } from '../_guard.js'

/** ช่องค้น "เพิ่มคนเข้ารอบ" — สมาชิกกับคนนอกมาในผลลัพธ์เดียวกัน */
export async function GET(req) {
  const ctx = await requireSession()
  if (ctx.error) return ctx.error

  const q = new URL(req.url).searchParams.get('q') || ''
  if (q.trim().length < 2) return Response.json([])
  return Response.json(await searchPayees(ctx.orgId, q))
}
