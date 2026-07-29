// GET /api/posts/watermarks?group=<ชื่อกลุ่ม> — ลายน้ำที่กลุ่มนี้ใช้ได้ + ค่า default
// (ไฟล์ชุดเดียวกับตะกร้าดิสฯ · จัดการที่ /bot/media/settings เหมือนเดิม ที่นี่อ่านอย่างเดียว)
import { postsContext } from '@/lib/postsGuard.js'
import { listPublishGroups, publisherIdentity } from '@/lib/publishTargets.js'
import { listWatermarks } from '@/lib/watermarks.js'

export async function GET(req) {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  const group = new URL(req.url).searchParams.get('group')
  if (!group) return Response.json({ error: 'ต้องระบุกลุ่ม' }, { status: 400 })

  try {
    const { userId, discordId } = await publisherIdentity(ctx.session)
    const groups = await listPublishGroups({ orgId: ctx.orgId, userId, discordId })
    const found = groups.find(g => g.name === group)
    // ไม่มีสิทธิ์ใช้กลุ่มนี้ = ไม่ต้องรู้ว่ามีลายน้ำอะไรบ้าง
    if (!found) return Response.json({ error: 'ไม่พบกลุ่มนี้' }, { status: 403 })

    const data = await listWatermarks({
      guildId: found.guildId, group: found.name, visibility: found.visibility, discordId,
    })
    return Response.json(data)
  } catch (error) {
    console.error('[GET /api/posts/watermarks]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
