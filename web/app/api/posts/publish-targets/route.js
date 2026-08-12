// GET /api/posts/publish-targets — ตัวเลือกของกล่องเผยแพร่: กลุ่มที่โพสต์ได้ + ห้องข่าวสารพร้อมไหม
//
// ทำไมไม่ใช้ /api/social/accounts: อันนั้น gate ด้วย canManageSocialGuild (ผู้ดูแลโซเชียล)
// คนเขียนโพสต์ทั่วไปจะได้ลิสต์ว่าง → กล่องเผยแพร่ใช้ไม่ได้ · ที่นี่ gate ด้วยสิทธิ์ posts แทน
// และคืนเฉพาะ id/ชื่อ/แพลตฟอร์ม (ไม่มี token หรือ social_id)
import { postsContext } from '@/lib/postsGuard.js'
import { getGuildId } from '@/lib/guildContext.js'
import {
  listPublishGroups, hasNewsChannel, attachNewsReady, attachNewsChannelName, publisherIdentity,
} from '@/lib/publishTargets.js'

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

    // ห้องข่าวสารเป็นของ "กลุ่ม" ไม่ใช่ของ guild ที่กำลังเปิดหน้าอยู่
    // (org เดียวมีหลาย guild → เลือกกลุ่มข้ามเซิร์ฟได้ ถ้าตัดสินด้วย session guild จะลงผิดห้อง)
    // ชื่อห้องดึงจาก Discord ตาม id (ไม่เก็บลง DB) → ช่องติ๊กบอกได้ว่าจะลงห้องไหนก่อนกด
    await attachNewsChannelName(await attachNewsReady(groups, { orgId: ctx.orgId }))

    return Response.json({
      groups: groups.map(g => ({
        name: g.name,
        visibility: g.visibility,
        platforms: Object.keys(g.accounts),
        accounts: Object.fromEntries(Object.entries(g.accounts).map(([p, a]) => [p, a.name])),
        newsReady: g.newsReady,
        newsChannelName: g.newsChannelName,   // null = ดึงชื่อไม่ได้ (บอทล่ม/ไม่มีสิทธิ์) — ยังส่งได้
        newsSource: g.newsSource,             // 'group' = ตั้งที่กลุ่ม · 'guild' = ใช้ค่าเดิมของเซิร์ฟ
      })),
      news,   // เคสไม่เลือกกลุ่ม (ติ๊กห้องข่าวสารอย่างเดียว) — ยึด guild ที่เปิดหน้าอยู่เหมือนเดิม
    })
  } catch (error) {
    console.error('[GET /api/posts/publish-targets]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
