import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import { isSuperAdmin } from '@/lib/roles.js'
import { deletePostFile } from '@/lib/postsStorage.js'
import * as basketDB from '@/db/posts/basket.js'
import pool from '@/db/index.js'

// ⚠️ ก้อน 4c (2026-07-30): ตะกร้าอยู่บน post_episodes/post_episode_media แล้ว (dc_media_baskets ตายแล้ว)
//    โค้ดรีเฟรช Discord CDN URL ที่เคยอยู่ไฟล์นี้ (fetchFreshUrls/isExpired/parseAttachmentId) **ลบทิ้งแล้ว**
//    — ไฟล์ถูกโหลดลงดิสก์ตอนหย่อน ไม่มีอะไรหมดอายุ · ตัวรีเฟรชที่ยังต้องใช้ฝั่งบอทอยู่ที่
//    services/discordAttachments.js (ที่เดียว)

const SNOWFLAKE = /^\d{15,20}$/

// ดู — member ใดก็ได้ของ guild ปัจจุบัน (กันข้าม guild)
async function authView(guildId, channelId) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }
  if (!SNOWFLAKE.test(guildId || '') || !SNOWFLAKE.test(channelId || '')) {
    return { error: 'invalid guild_id / channel_id', status: 400 }
  }
  const { rows: membership } = await pool.query(
    'SELECT 1 FROM org_members om JOIN users u ON u.id = om.user_id WHERE om.guild_id = $1 AND u.discord_id = $2 LIMIT 1',
    [guildId, session.user.discordId]
  )
  if (!membership.length) return { error: 'Forbidden', status: 403 }
  const { access, discordId } = await getEffectiveIdentity(session)
  return { ok: true, session, access, discordId }
}

// แก้ไข (reorder/caption/ลบ) — เฉพาะทีมสื่อ (editor) หรือ admin/เลขา (superadmin bypass เมื่อไม่ได้ debug)
async function authEdit(guildId, channelId) {
  const a = await authView(guildId, channelId)
  if (!a.ok) return a
  if (isSuperAdmin(a.discordId)) return a
  if (!can('manageBasket', a.access.permissions)) return { error: 'Forbidden', status: 403 }
  return a
}

// GET /api/bot/basket?guild=...&channel=...  → { images: [...], videos: [...], caption }
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const guildId   = searchParams.get('guild')
  const channelId = searchParams.get('channel')
  const a = await authView(guildId, channelId)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const { images, videos, caption } = await basketDB.getBasketContent(guildId, channelId)
  return Response.json({ images, videos, caption })
}

// PATCH /api/bot/basket  body: { guild, channel, action: 'reorder'|'caption', order?, caption? }
export async function PATCH(req) {
  const body = await req.json().catch(() => ({}))
  const { guild: guildId, channel: channelId, action } = body
  const a = await authEdit(guildId, channelId)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  if (action === 'reorder') {
    const order = Array.isArray(body.order) ? body.order.map(Number).filter(Number.isInteger) : []
    if (!order.length) return Response.json({ error: 'order ว่าง' }, { status: 400 })
    // scope ด้วย guild+channel กัน reorder ข้ามห้อง/ข้าม guild
    await basketDB.reorderBasketImages(guildId, channelId, order)
    return Response.json({ ok: true })
  }

  if (action === 'caption') {
    await basketDB.setBasketCaption(guildId, channelId, (body.caption ?? '').toString())
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'unknown action' }, { status: 400 })
}

// DELETE /api/bot/basket?guild=...&channel=...[&id=...]
//   มี id → ลบสื่อชิ้นนั้นชิ้นเดียว, ไม่มี id → ล้างตะกร้า (= archive โพสต์ ไม่ใช่ลบแถว)
export async function DELETE(req) {
  const { searchParams } = new URL(req.url)
  const guildId   = searchParams.get('guild')
  const channelId = searchParams.get('channel')
  const idParam = searchParams.get('id')
  const a = await authEdit(guildId, channelId)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  if (idParam != null) {
    const id = Number(idParam)
    if (!Number.isInteger(id)) return Response.json({ error: 'invalid id' }, { status: 400 })
    const deleted = await basketDB.deleteBasketMedia(guildId, channelId, id)
    // ลบไฟล์ล้มไม่ทำให้ request พัง — แถวใน DB เป็นเจ้าของความจริง
    if (deleted?.path) await deletePostFile(deleted.path).catch(e => console.error('[basket ลบไฟล์]', e.message))
    return Response.json({ ok: true })
  }

  await basketDB.clearBasket(guildId, channelId)
  return Response.json({ ok: true })
}
