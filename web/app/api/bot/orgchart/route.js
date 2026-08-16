import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getOrgChartData } from '@/db/orgchart.js'

// เปิดให้สมาชิกทุกคนในกิลด์ดูได้ (เคาะกับ user 2026-08-17) — ไม่ gate ด้วย isAdmin
// getGuildId(session) เช็ค membership ให้แล้ว (guildContext.js) ไม่ต้องเช็คซ้ำ
const ALLOWED_DAYS = new Set([30, 60, 90, 180, 365])

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  if (!guildId) return Response.json({ error: 'No guild' }, { status: 404 })

  const daysParam = Number(new URL(request.url).searchParams.get('days'))
  const days = ALLOWED_DAYS.has(daysParam) ? daysParam : 180

  const groups = await getOrgChartData(guildId, days)
  return Response.json({ guildId, days, groups })
}
