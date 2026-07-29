// GET /api/posts/publish-targets — ตัวเลือกของกล่องเผยแพร่: กลุ่มที่โพสต์ได้ + ห้องข่าวสารพร้อมไหม
//
// ทำไมไม่ใช้ /api/social/accounts: อันนั้น gate ด้วย canManageSocialGuild (ผู้ดูแลโซเชียล)
// คนเขียนโพสต์ทั่วไปจะได้ลิสต์ว่าง → กล่องเผยแพร่ใช้ไม่ได้ · ที่นี่ gate ด้วยสิทธิ์ posts แทน
// และคืนเฉพาะ id/ชื่อ/แพลตฟอร์ม (ไม่มี token หรือ social_id)
import { postsContext } from '@/lib/postsGuard.js'
import { getGuildId } from '@/lib/guildContext.js'
import { listPublishGroups, hasNewsChannel, publisherIdentity } from '@/lib/publishTargets.js'

export async function GET() {
  const ctx = await postsContext()
  if (ctx.error) return ctx.error

  try {
    const { userId, discordId } = await publisherIdentity(ctx.session)
    const guildId = await getGuildId(ctx.session)
    const [groups, news] = await Promise.all([
      listPublishGroups({ orgId: ctx.orgId, userId, discordId }),
      hasNewsChannel(guildId),
    ])

    return Response.json({
      groups: groups.map(g => ({
        name: g.name,
        visibility: g.visibility,
        platforms: Object.keys(g.accounts),
        accounts: Object.fromEntries(Object.entries(g.accounts).map(([p, a]) => [p, a.name])),
      })),
      news,
    })
  } catch (error) {
    console.error('[GET /api/posts/publish-targets]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
