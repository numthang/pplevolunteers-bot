// web/db/posts/media.js — สื่อของโพสต์ (อัปโหลด + การ์ดคำคม)
// FK ยังชื่อ episode_id ตามชื่อตาราง post_episode_media (ไม่มี series แล้ว แต่ชื่อคอลัมน์คงเดิม)
//
// path = relative จาก repo root (`storage/posts/<uuid>.jpg`) — นอก public/ (grill ข้อ 5)
// การ์ดคำคมเก็บ **params** (quote_text/quote_style/bg_path) ไม่ใช่แค่ PNG → ก้อน 2b render ใหม่ได้
// ลบแถวไม่เท่ากับลบไฟล์ — จุดที่ลบไฟล์จริงมีที่เดียวคือ deleteMedia ทีละชิ้นจากหน้าจอ
import pool from '../index.js'

export async function listMedia(episodeId) {
  const { rows } = await pool.query(
    // source_url = ลิงก์ต้นทางบน Discord · ต้องคืนมาด้วยเสมอ เพราะสื่อที่ตัวโหลดพื้นหลังยังไม่ดึงลงดิสก์
    // (path NULL) เสิร์ฟผ่าน /api/posts/media/[id] ไม่ได้ → UI ต้อง fallback ไป CDN ของ Discord แทน
    `SELECT id, episode_id, kind, path, source_url, sort_order, quote_text, quote_style, bg_path, source_hash, added_by, created_at
       FROM post_episode_media
      WHERE episode_id = $1
      ORDER BY sort_order, id`,
    [episodeId]
  )
  return rows
}

/**
 * หาแถวที่อ้าง path นี้ — ใช้กันไม่ให้ยิง path ของโพสต์อื่นมาเป็นพื้นหลังการ์ด
 * ไฟล์พื้นหลังที่เพิ่งอัป (ยังไม่มีแถว) จะคืน [] = ผ่าน ซึ่งถูกแล้ว
 */
export async function findMediaByPath(path) {
  const { rows } = await pool.query(
    `SELECT id, episode_id FROM post_episode_media WHERE path = $1`,
    [path]
  )
  return rows
}

export async function countMedia(episodeId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM post_episode_media WHERE episode_id = $1`,
    [episodeId]
  )
  return rows[0].n
}

/** นับเฉพาะคลิป — โพสต์หนึ่งมีได้ชิ้นเดียว (ท่อ publish เก็บ videoUrl ตัวเดียว) */
export async function countVideos(episodeId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM post_episode_media WHERE episode_id = $1 AND kind = 'video'`,
    [episodeId]
  )
  return rows[0].n
}

/** ต่อท้ายเสมอ (sort_order = MAX+1) — เรียงใหม่ทำผ่าน reorderMedia */
export async function addMedia({ episodeId, kind = 'upload', path, quoteText = null, quoteStyle = null, bgPath = null, sourceHash = null, addedBy = null, sourceAssetId = null }) {
  const { rows } = await pool.query(
    // source_asset_id = หยิบมาจากคลังภาพใบไหน (ไฟล์เป็น**สำเนา**คนละใบกับคลัง — ดู db/posts/assets.js)
    `INSERT INTO post_episode_media (episode_id, kind, path, sort_order, quote_text, quote_style, bg_path, source_hash, added_by, source_asset_id)
     SELECT $1, $2, $3, COALESCE(MAX(sort_order), -1) + 1, $4, $5, $6, $7, $8, $9
       FROM post_episode_media WHERE episode_id = $1
     RETURNING id, episode_id, kind, path, sort_order, quote_text, quote_style, bg_path, source_asset_id, created_at`,
    [episodeId, kind, path, quoteText, quoteStyle, bgPath, sourceHash, addedBy, sourceAssetId]
  )
  return rows[0]
}

/** ลากเรียงใหม่ — sort_order ไม่มี unique constraint จึงเขียนรวดเดียวได้ (ต่างจาก episodes.seq) */
export async function reorderMedia(episodeId, orderedIds) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: own } = await client.query(
      `SELECT id FROM post_episode_media WHERE episode_id = $1 AND id = ANY($2::bigint[])`,
      [episodeId, orderedIds]
    )
    if (own.length !== orderedIds.length) throw new Error('reorderMedia: มี id ที่ไม่ใช่สื่อของตอนนี้')
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(`UPDATE post_episode_media SET sort_order = $2 WHERE id = $1`, [orderedIds[i], i])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * แทนที่ไฟล์ของสื่อชิ้นเดิม (ครอบตัด/เบลอหน้าจากหน้าเว็บ) — id และ sort_order คงเดิม
 *
 * ⚠️ ล้าง `source_url` ทิ้งเสมอ — ไม่งั้นวันที่ไฟล์บนดิสก์หาย UI จะ fallback ไปโชว์รูปต้นฉบับ
 *    บน CDN ของ Discord ที่ **ยังไม่ได้เบลอหน้า** (จุดตายของฟีเจอร์นี้)
 * ⚠️ การ์ดคำคมที่ถูกแก้พิกเซลแล้ว render จากพารามิเตอร์เดิมไม่ได้อีก → กลายเป็น kind='upload'
 *    และล้าง quote_text/quote_style/bg_path ทิ้ง (ไม่แตะ **ไฟล์** พื้นหลัง — แถวอื่นอาจใช้อยู่)
 */
export async function replaceMediaFile(id, path) {
  const { rows } = await pool.query(
    `UPDATE post_episode_media
        SET path = $2, kind = 'upload', source_url = NULL, source_hash = NULL,
            quote_text = NULL, quote_style = NULL, bg_path = NULL
      WHERE id = $1
      RETURNING id, episode_id, kind, path, source_url, sort_order, quote_text, quote_style,
                bg_path, source_hash, added_by, created_at`,
    [id, path]
  )
  return rows[0] || null
}

/**
 * ทับไฟล์คลิปด้วยตัวที่เบิร์นคำคมแล้ว — id/sort_order เดิม (ยังนับเป็น 1 คลิปของโพสต์)
 *
 * ⛔ ใช้ `replaceMediaFile()` แทนไม่ได้ — ตัวนั้น hardcode `kind = 'upload'` จะทำให้คลิป
 *    กลายเป็นรูปในสายตาของ UI และท่อโพสต์ทันที
 * ℹ️ ล้าง `source_url` ด้วย: ไฟล์นี้เป็นของที่เรา render เอง ไม่ใช่ของที่โหลดมาจาก Discord
 *    ผลพลอยได้คือ `postsRetention` จะไม่ลบให้ (มันลบเฉพาะคลิปที่ยังมีต้นทางให้กลับไปหา)
 */
export async function replaceVideoFile(id, path, quoteText) {
  const { rows } = await pool.query(
    `UPDATE post_episode_media
        SET path = $2, quote_text = $3, source_url = NULL, source_hash = NULL
      WHERE id = $1 AND kind = 'video'
      RETURNING id, episode_id, kind, path, source_url, sort_order, quote_text, created_at`,
    [id, path, quoteText]
  )
  return rows[0] || null
}

/** ยังมีแถวอื่นอ้างไฟล์นี้อยู่ไหม (path หรือ bg_path) — เช็คก่อนลบไฟล์เก่าทิ้ง */
export async function pathStillUsed(path, exceptId = null) {
  const { rows } = await pool.query(
    `SELECT 1 FROM post_episode_media
      WHERE (path = $1 OR bg_path = $1) AND ($2::bigint IS NULL OR id <> $2)
      LIMIT 1`,
    [path, exceptId]
  )
  return rows.length > 0
}

export async function getMedia(id) {
  const { rows } = await pool.query(
    `SELECT id, episode_id, kind, path, sort_order, quote_text, quote_style, bg_path, created_at
       FROM post_episode_media WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

/** คืนแถวสื่อพร้อมโพสต์ที่เป็นเจ้าของ — route เสิร์ฟไฟล์ต้องเช็ค canReadPost ก่อน stream เสมอ */
export async function getMediaWithPost(id) {
  const { rows } = await pool.query(
    `SELECT m.id, m.episode_id, m.kind, m.path, m.quote_text, m.quote_style, m.bg_path,
            e.org_id, e.created_by, e.visibility, e.status
       FROM post_episode_media m
       JOIN post_episodes e ON e.id = m.episode_id
      WHERE m.id = $1`,
    [id]
  )
  return rows[0] || null
}

export async function deleteMedia(id) {
  const { rows } = await pool.query(
    `DELETE FROM post_episode_media WHERE id = $1 RETURNING path, bg_path`,
    [id]
  )
  return rows[0] || null
}
