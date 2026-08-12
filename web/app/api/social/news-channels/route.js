// GET /api/social/news-channels — ห้องข่าวสารที่ "ลงทะเบียนไว้" ของทุกเซิร์ฟในองค์กรนี้
//
// ทะเบียน = ค่าที่ตั้งไว้หน้า /bot (`dc_guild_config.news_channel_id`) 1 ห้องต่อเซิร์ฟ
// modal ผูกห้องให้กลุ่มเลือกจากลิสต์นี้เท่านั้น — ไม่กางห้องทั้งเซิร์ฟให้เลือก (ราชบุรีมี 76 ห้อง
// เลือกผิดง่ายและไม่มีใครยืนยันว่าบอทส่งเข้าห้องนั้นได้) · ชื่อห้องดึงสดจาก Discord ไม่เก็บลง DB
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild } from '@/lib/roles.js'
import { isMediaTeam } from '@/lib/postsAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { guildsOfOrg } from '@/db/guilds.js'
import { guildNewsChannels } from '@/lib/publishTargets.js'
import { listGuildChannels } from '@/lib/discordChannels.js'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageSocialGuild(access) && !isMediaTeam(access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const orgId = await getOrgId(session)
    const guilds = await guildsOfOrg(orgId)
    const configured = await guildNewsChannels(guilds.map(g => g.guild_id))

    const rooms = await Promise.all(
      guilds
        .filter(g => configured.has(g.guild_id))
        .map(async g => {
          const channelId = configured.get(g.guild_id)
          const list = await listGuildChannels(g.guild_id)
          return {
            guildId: g.guild_id,
            guildName: g.name,
            channelId,
            // null = ดึงชื่อไม่ได้ (บอทไม่อยู่ในเซิร์ฟ/ไม่มีสิทธิ์) — ยังผูกได้ UI โชว์ id แทน
            channelName: list?.find(c => c.id === channelId)?.name || null,
          }
        })
    )

    return Response.json({ rooms })
  } catch (error) {
    console.error('[GET /api/social/news-channels]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
