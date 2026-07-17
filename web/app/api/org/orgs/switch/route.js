import { cookies } from 'next/headers'
import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { guildsOfOrg } from '@/db/guilds.js'
import { ACTIVE_ORG_COOKIE } from '@/lib/activeOrg.js'
import { SELECTED_GUILD_COOKIE } from '@/lib/guildContext.js'

// POST /api/org/orgs/switch — เลือก active org (เก็บ cookie) · ต้องเป็น member ที่ active
export async function POST(req) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const orgId = Number(body.orgId)
  const membership = await getOrgMembership(orgId, userId)
  if (!membership || membership.status !== 'active') {
    return Response.json({ error: 'ไม่ได้เป็นสมาชิก org นี้' }, { status: 403 })
  }

  const jar = await cookies()
  const opts = {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  }
  jar.set(ACTIVE_ORG_COOKIE, String(orgId), opts)

  // dual-write: guild-based features (calling/docs/cases/bot) ยังใช้ selected_guild
  // → sync ให้ guild หลักของ org ที่เลือก (prefer env.GUILD_ID ถ้าอยู่ใน org) เพื่อ align กับ active_org
  // guildless org → ไม่แตะ (feature guild-based ถูกซ่อนใน Nav อยู่แล้ว)
  const orgGuilds = await guildsOfOrg(orgId)
  if (orgGuilds.length > 0) {
    const primary = orgGuilds.find(g => g.guild_id === process.env.GUILD_ID) || orgGuilds[0]
    jar.set(SELECTED_GUILD_COOKIE, primary.guild_id, opts)
  }
  return Response.json({ ok: true, orgId })
}
