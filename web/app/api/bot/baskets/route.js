import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getGuildId } from '@/lib/guildContext.js'
import { listGuildBaskets } from '@/db/posts/basket.js'

// GET /api/bot/baskets — รายการตะกร้าทั้งหมดใน guild ปัจจุบัน (ดูได้ทุก member, scope ด้วย guild)
// ก้อน 4c: อ่านจาก post_episodes ที่ยังไม่ archive (ตะกร้า = โพสต์ที่ผูกห้องอยู่)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const guildId = await getGuildId(session)
  const baskets = await listGuildBaskets(guildId)

  return Response.json({ guildId, baskets })
}
