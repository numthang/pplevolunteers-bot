import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import pool from '@/db/index.js'

const SNOWFLAKE = /^\d{15,20}$/

// ตะกร้าเป็น internal media tool — เข้าผ่านลิงก์จาก Discord embed (ephemeral, เห็นคนเดียว)
// auth: แค่ login เป็นสมาชิก guild พอ + scope ทุก query ด้วย guild_id + channel_id (snowflake)
// content = Discord CDN image URL (public อยู่แล้ว) + caption → sensitivity ต่ำ ไม่ต้อง gate ระดับ admin
async function auth(guildId, channelId) {
  const session = await getServerSession(authOptions)
  if (!session) return { error: 'Unauthorized', status: 401 }
  if (!SNOWFLAKE.test(guildId || '') || !SNOWFLAKE.test(channelId || '')) {
    return { error: 'invalid guild_id / channel_id', status: 400 }
  }
  return { ok: true, session }
}

// GET /api/bot/basket?guild=...&channel=...  → { images: [...], caption }
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const guildId   = searchParams.get('guild')
  const channelId = searchParams.get('channel')
  const a = await auth(guildId, channelId)
  if (!a.ok) return Response.json({ error: a.error }, { status: a.status })

  const { rows } = await pool.query(
    `SELECT id, type, image_url, caption, message_id, sort_order
     FROM dc_media_baskets WHERE guild_id = $1 AND channel_id = $2
     ORDER BY sort_order ASC, added_at ASC`,
    [guildId, channelId]
  )
  const images  = rows.filter(r => r.type === 'image').map(r => ({
    id: r.id, url: r.image_url, message_id: r.message_id, sort_order: r.sort_order,
  }))
  const videos  = rows.filter(r => r.type === 'video').map(r => ({ id: r.id, url: r.image_url }))
  const caption = rows.find(r => r.type === 'caption')?.caption || ''
  return Response.json({ images, videos, caption })
}

// PATCH /api/bot/basket  body: { guild, channel, action: 'reorder'|'caption', order?, caption? }
export async function PATCH(req) {
  const body = await req.json().catch(() => ({}))
  const { guild: guildId, channel: channelId, action } = body
  const a = await auth(guildId, channelId)
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
  const a = await auth(guildId, channelId)
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
