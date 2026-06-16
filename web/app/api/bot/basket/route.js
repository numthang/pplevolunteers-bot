import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import { isSuperAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

const SNOWFLAKE = /^\d{15,20}$/

// ดู — member ใดก็ได้ของ guild ปัจจุบัน (กันข้าม guild)
async function authView(guildId, channelId) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }
  if (!SNOWFLAKE.test(guildId || '') || !SNOWFLAKE.test(channelId || '')) {
    return { error: 'invalid guild_id / channel_id', status: 400 }
  }
  const { rows: membership } = await pool.query(
    'SELECT 1 FROM dc_members WHERE guild_id = $1 AND discord_id = $2 LIMIT 1',
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

// parse attachment_id จาก URL path — ไม่เปลี่ยนแม้ query string หมดอายุ
function parseAttachmentId(url) {
  return url?.match(/\/attachments\/\d+\/(\d+)\//)?.[1] || null
}

// Discord CDN URL มี ?ex=<hex unix timestamp> — เช็คว่าหมดอายุหรือยัง (buffer 5 นาที)
function isExpired(url) {
  const ex = url?.match(/[?&]ex=([0-9a-f]+)/i)?.[1]
  if (!ex) return true
  return Date.now() / 1000 > parseInt(ex, 16) - 300
}

// fetch fresh URLs จาก Discord API, คืน Map: attachment_id → fresh URL
async function fetchFreshUrls(channelId, messageIds) {
  const map = new Map()
  await Promise.all([...messageIds].map(async msgId => {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/channels/${channelId}/messages/${msgId}`,
        { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
      )
      if (!res.ok) return
      const msg = await res.json()
      for (const att of msg.attachments || []) map.set(String(att.id), att.url)
    } catch {}
  }))
  return map
}

// GET /api/bot/basket?guild=...&channel=...  → { images: [...], videos: [...], caption }
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const guildId   = searchParams.get('guild')
  const channelId = searchParams.get('channel')
  const a = await authView(guildId, channelId)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const { rows } = await pool.query(
    `SELECT id, type, image_url, caption, message_id, sort_order
     FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2
     ORDER BY sort_order ASC, added_at ASC`,
    [guildId, channelId]
  )

  const imageRows = rows.filter(r => r.type === 'image')

  // เฉพาะรูปที่ URL หมดอายุแล้วเท่านั้นที่ fetch ใหม่
  const expiredRows = imageRows.filter(r => isExpired(r.image_url) && r.message_id)
  const msgIds = new Set(expiredRows.map(r => r.message_id))
  const freshMap = msgIds.size ? await fetchFreshUrls(channelId, msgIds) : new Map()

  // update DB + build response
  const images = await Promise.all(imageRows.map(async r => {
    if (!isExpired(r.image_url)) return { id: r.id, url: r.image_url, sort_order: r.sort_order }
    const attId   = parseAttachmentId(r.image_url)
    const freshUrl = attId ? freshMap.get(attId) : null
    if (freshUrl) {
      await pool.query(`UPDATE dc_media_baskets SET image_url = $1 WHERE id = $2`, [freshUrl, r.id])
    }
    return { id: r.id, url: freshUrl || r.image_url, sort_order: r.sort_order }
  }))

  const videos  = rows.filter(r => r.type === 'video').map(r => ({ id: r.id, url: r.image_url }))
  const caption = rows.find(r => r.type === 'caption')?.caption || ''
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
    for (let i = 0; i < order.length; i++) {
      await pool.query(
        `UPDATE dc_media_baskets SET sort_order = $1
         WHERE id = $2 AND guild_id = $3 AND channel_id = $4 AND type = 'image'`,
        [i + 1, order[i], guildId, channelId]
      )
    }
    return Response.json({ ok: true })
  }

  if (action === 'caption') {
    const caption = (body.caption ?? '').toString()
    await pool.query(
      `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2 AND type = 'caption'`,
      [guildId, channelId]
    )
    if (caption.trim()) {
      await pool.query(
        `INSERT INTO dc_media_baskets (guild_id, channel_id, added_by, type, caption)
         VALUES ($1, $2, $3, 'caption', $4)`,
        [guildId, channelId, a.session.user.discordId, caption]
      )
    }
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'unknown action' }, { status: 400 })
}

// DELETE /api/bot/basket?guild=...&channel=...[&id=...]
//   มี id → ลบรูปนั้นรูปเดียว, ไม่มี id → ล้างตะกร้าทั้งหมด
export async function DELETE(req) {
  const { searchParams } = new URL(req.url)
  const guildId   = searchParams.get('guild')
  const channelId = searchParams.get('channel')
  const idParam = searchParams.get('id')
  const a = await authEdit(guildId, channelId)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const id = Number(idParam)
  if (idParam != null) {
    if (!Number.isInteger(id)) return Response.json({ error: 'invalid id' }, { status: 400 })
    await pool.query(
      `DELETE FROM dc_media_baskets WHERE id = $1 AND guild_id = $2 AND channel_id = $3 AND type IN ('image', 'video')`,
      [id, guildId, channelId]
    )
    return Response.json({ ok: true })
  }

  await pool.query(
    `DELETE FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2`,
    [guildId, channelId]
  )
  return Response.json({ ok: true })
}
