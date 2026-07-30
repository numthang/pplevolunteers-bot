// web/db/posts/basket.js — ตะกร้าสื่อของ Discord ฝั่งเว็บ
//
// ⚠️ ก้อน 4c (2026-07-30): ตะกร้าไม่มีตารางของตัวเองแล้ว — เป็นแถวใน post_episodes ที่
//    `channel_id = ห้องนั้น AND archived_at IS NULL` (partial unique index บังคับให้เหลือใบเดียว)
//
// ไฟล์นี้คือ **ฝาแฝดฝั่งเว็บของ `db/mediaBasket.js`** (บอท CJS · เว็บ ESM คนละ pool
// เลย import ข้ามกันไม่ได้) — แก้ logic ที่ไหน ต้องไล่ดูอีกฝั่งเสมอ
//
// ไฟล์จริงอยู่นอก `public/` → เสิร์ฟผ่าน `/api/bot/basket/media/[id]` ที่เช็คสิทธิ์ก่อน stream
import pool from '../index.js'

const serveUrl = id => `/api/bot/basket/media/${id}`

/** ตะกร้าที่เปิดอยู่ของห้อง — คืน null ถ้าห้องนี้ไม่มีตะกร้า */
export async function getOpenBasket(guildId, channelId) {
  const { rows } = await pool.query(
    `SELECT id, org_id, category, body FROM post_episodes
      WHERE channel_id = $2 AND guild_id = $1 AND archived_at IS NULL LIMIT 1`,
    [guildId, channelId]
  )
  return rows[0] || null
}

/**
 * เนื้อในตะกร้าในรูปแบบที่หน้าเว็บใช้อยู่ — { images, videos, caption }
 * `url` ชี้ route ที่เช็คสิทธิ์ก่อนเสิร์ฟ (ไม่ใช่ลิงก์ Discord ที่หมดอายุ ~24 ชม.)
 * `sourceUrl` เก็บไว้ทำลิงก์ "ดูต้นทาง" เท่านั้น
 */
export async function getBasketContent(guildId, channelId) {
  const ep = await getOpenBasket(guildId, channelId)
  if (!ep) return { images: [], videos: [], caption: '' }

  const { rows } = await pool.query(
    `SELECT id, kind, path, source_url, source_message_id, sort_order
       FROM post_episode_media WHERE episode_id = $1 ORDER BY sort_order, id`,
    [ep.id]
  )

  return {
    episodeId: ep.id,
    images: rows.filter(r => r.kind !== 'video').map(r => ({
      id: r.id, url: serveUrl(r.id), sourceUrl: r.source_url, sort_order: r.sort_order, ready: !!r.path,
    })),
    videos: rows.filter(r => r.kind === 'video').map(r => ({
      id: r.id, url: serveUrl(r.id), sourceUrl: r.source_url, ready: !!r.path,
    })),
    caption: ep.body || '',
  }
}

/** ตะกร้าทั้งหมดใน guild (การ์ดรวมหน้า /bot/media/basket) */
export async function listGuildBaskets(guildId) {
  const { rows } = await pool.query(
    `SELECT e.channel_id,
            e.category AS channel_name,
            COUNT(m.id) FILTER (WHERE m.kind <> 'video')::int AS image_count,
            COUNT(m.id) FILTER (WHERE m.kind =  'video')::int AS video_count,
            GREATEST(e.updated_at, COALESCE(MAX(m.created_at), e.created_at)) AS last_added,
            e.body AS caption,
            COALESCE(
              (SELECT array_agg('/api/bot/basket/media/' || m2.id ORDER BY m2.sort_order, m2.id)
                 FROM post_episode_media m2
                WHERE m2.episode_id = e.id AND m2.kind <> 'video'),
              '{}'
            ) AS thumbnails
       FROM post_episodes e
       LEFT JOIN post_episode_media m ON m.episode_id = e.id
      WHERE e.guild_id = $1 AND e.channel_id IS NOT NULL AND e.archived_at IS NULL
      GROUP BY e.id
      ORDER BY last_added DESC`,
    [guildId]
  )
  return rows
}

/** แถวสื่อ + ห้อง/guild ที่มันสังกัด — route เสิร์ฟไฟล์ต้องเช็คว่าตรงกับที่ขอมาก่อน stream เสมอ */
export async function getBasketMediaWithScope(mediaId) {
  const { rows } = await pool.query(
    `SELECT m.id, m.path, m.kind, m.source_url, e.guild_id, e.channel_id, e.archived_at
       FROM post_episode_media m
       JOIN post_episodes e ON e.id = m.episode_id
      WHERE m.id = $1`,
    [mediaId]
  )
  return rows[0] || null
}

export async function reorderBasketImages(guildId, channelId, orderedIds) {
  const ep = await getOpenBasket(guildId, channelId)
  if (!ep) return false
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query(
      `UPDATE post_episode_media SET sort_order = $1 WHERE id = $2 AND episode_id = $3 AND kind <> 'video'`,
      [i, orderedIds[i], ep.id]
    )
  }
  return true
}

/** caption ของตะกร้า = body ของโพสต์ (ไม่ใช่ "แถวชนิดหนึ่ง" อีกแล้ว) */
export async function setBasketCaption(guildId, channelId, caption) {
  const ep = await getOpenBasket(guildId, channelId)
  if (!ep) return false
  await pool.query(
    `UPDATE post_episodes SET body = $2, updated_at = now() WHERE id = $1`,
    [ep.id, caption?.trim() ? caption : null]
  )
  return true
}

/** ลบสื่อทีละชิ้น — คืน path เพื่อให้ caller ลบไฟล์ตาม */
export async function deleteBasketMedia(guildId, channelId, mediaId) {
  const ep = await getOpenBasket(guildId, channelId)
  if (!ep) return null
  const { rows } = await pool.query(
    `DELETE FROM post_episode_media WHERE id = $1 AND episode_id = $2 RETURNING path`,
    [mediaId, ep.id]
  )
  return rows[0] || null
}

/** ล้างตะกร้า = **archive โพสต์** (ห้ามลบแถว — มันคือคอนเทนต์ · ยังรู้ว่ามาจากห้องไหน) */
export async function clearBasket(guildId, channelId) {
  const { rowCount } = await pool.query(
    `UPDATE post_episodes SET archived_at = now(), updated_at = now()
      WHERE channel_id = $2 AND guild_id = $1 AND archived_at IS NULL`,
    [guildId, channelId]
  )
  return rowCount > 0
}
