// web/db/posts/media.js — สื่อของโพสต์ (อัปโหลด + การ์ดคำคม)
// FK ยังชื่อ episode_id ตามชื่อตาราง post_episode_media (ไม่มี series แล้ว แต่ชื่อคอลัมน์คงเดิม)
//
// path = relative จาก repo root (`storage/posts/<uuid>.jpg`) — นอก public/ (grill ข้อ 5)
// การ์ดคำคมเก็บ **params** (quote_text/quote_style/bg_path) ไม่ใช่แค่ PNG → ก้อน 2b render ใหม่ได้
// ลบแถวไม่เท่ากับลบไฟล์ — จุดที่ลบไฟล์จริงมีที่เดียวคือ deleteMedia ทีละชิ้นจากหน้าจอ
import pool from '../index.js'

export async function listMedia(episodeId) {
  const { rows } = await pool.query(
    `SELECT id, episode_id, kind, path, sort_order, quote_text, quote_style, bg_path, source_hash, added_by, created_at
       FROM post_episode_media
      WHERE episode_id = $1
      ORDER BY sort_order, id`,
    [episodeId]
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

/** ต่อท้ายเสมอ (sort_order = MAX+1) — เรียงใหม่ทำผ่าน reorderMedia */
export async function addMedia({ episodeId, kind = 'upload', path, quoteText = null, quoteStyle = null, bgPath = null, sourceHash = null, addedBy = null }) {
  const { rows } = await pool.query(
    `INSERT INTO post_episode_media (episode_id, kind, path, sort_order, quote_text, quote_style, bg_path, source_hash, added_by)
     SELECT $1, $2, $3, COALESCE(MAX(sort_order), -1) + 1, $4, $5, $6, $7, $8
       FROM post_episode_media WHERE episode_id = $1
     RETURNING id, episode_id, kind, path, sort_order, quote_text, quote_style, bg_path, created_at`,
    [episodeId, kind, path, quoteText, quoteStyle, bgPath, sourceHash, addedBy]
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
            e.org_id, e.owner_user_id, e.visibility, e.status
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
