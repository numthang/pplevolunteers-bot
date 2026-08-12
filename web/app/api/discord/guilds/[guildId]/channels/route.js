// GET /api/discord/guilds/[guildId]/channels — ห้องที่ส่งข้อความได้ของเซิร์ฟนั้น (ให้ dropdown ใช้)
//
// ทำไมต้องมี: ก่อนหน้านี้ตั้งห้องข่าวสารด้วยการ "พิมพ์ channel ID 19 หลัก" ที่ /bot
// เปิดดูทีหลังก็ไม่รู้ว่าเลขนั้นคือห้องอะไร → หน้า settings ต้องเลือกจากชื่อได้
//
// ไม่คืน token/permission อะไร — แค่ id + ชื่อ + ชนิด + ชื่อหมวด
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild } from '@/lib/roles.js'
import { isMediaTeam } from '@/lib/postsAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { listGuildChannels } from '@/lib/discordChannels.js'

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { guildId } = await params
  const { access } = await getEffectiveIdentity(session)
  if (!canManageSocialGuild(access) && !isMediaTeam(access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // guild ต้องอยู่ใน org ของ session — ไม่งั้นเห็นชื่อห้องขององค์กรอื่น (ตระกูล cross-tenant leak)
  const [orgId, guildOrgId] = await Promise.all([getOrgId(session), orgIdOfGuild(guildId)])
  if (!orgId || !guildOrgId || orgId !== guildOrgId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const channels = await listGuildChannels(guildId)
  // null = ดึงจาก Discord ไม่ได้ (บอทไม่อยู่ในเซิร์ฟ / ไม่มีสิทธิ์ / rate limit)
  // → บอก client ให้ตกลงไปใช้ช่องกรอก ID ดิบ ไม่ใช่โชว์ dropdown ว่างเปล่าแบบไม่มีเหตุผล
  if (channels === null) {
    return Response.json({ channels: [], unavailable: true })
  }
  return Response.json({ channels })
}
