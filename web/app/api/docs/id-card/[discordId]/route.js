import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getIdCard } from '@/db/docs/idCard.js'
import { getEntryByToken } from '@/db/docs/entries.js'

const SNOWFLAKE = /^\d{17,20}$/

/**
 * GET /api/docs/id-card/[discordId]
 * เสิร์ฟสำเนาบัตร (ภาพดิบที่เก็บไว้ — ยังไม่ลายน้ำ) สำหรับ preview
 * auth: เจ้าของ หรือ canManageDocs
 * guild: จาก guild cookie ปกติ หรือ ?token= (สำหรับหน้า sign ที่ไม่มี cookie)
 */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { discordId } = await params
  if (!SNOWFLAKE.test(discordId)) {
    return Response.json({ error: 'invalid id' }, { status: 400 })
  }

  const { access, discordId: selfId } = await getEffectiveIdentity(session)
  const isOwner = discordId === selfId
  if (!isOwner && !canManageDocs(access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // derive guildId: prefer session cookie, fallback to sign token
  let guildId = await getGuildId(session)
  if (!guildId) {
    const token = new URL(req.url).searchParams.get('token')
    if (token) {
      const entry = await getEntryByToken(token)
      guildId = entry?.guild_id ?? null
    }
  }
  if (!guildId) return Response.json({ error: 'guild not found' }, { status: 400 })

  const image = await getIdCard(discordId, guildId)
  if (!image) return Response.json({ error: 'Not found' }, { status: 404 })

  const buf = Buffer.isBuffer(image) ? image : Buffer.from(image)
  return new Response(buf, {
    headers: {
      'Content-Type':  'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  })
}
