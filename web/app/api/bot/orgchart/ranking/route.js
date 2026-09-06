import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getMemberRanking } from '@/db/orgchart.js'

// อันดับรายคนทั้งเซิร์ฟเวอร์ (view bubble ของ /team) — สิทธิ์เท่ากับ /api/bot/orgchart
// คือสมาชิกทุกคนในกิลด์ดูได้ (getGuildId เช็ค membership ให้แล้ว)
const MAX_LIMIT = 200
// ชุดเดียวกับปุ่มช่วงเวลาของผังเครือข่าย (/api/bot/orgchart) · ไม่ส่งมา = ตลอดกาล
const ALLOWED_DAYS = new Set([30, 60, 90, 180, 365])

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!guildId) return Response.json({ error: 'No guild' }, { status: 404 })

  const params = new URL(request.url).searchParams
  const raw = Number(params.get('limit'))
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : 100
  const daysParam = Number(params.get('days'))
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : null

  const members = await getMemberRanking(guildId, limit, days)
  return Response.json({ guildId, limit, days, members })
}
