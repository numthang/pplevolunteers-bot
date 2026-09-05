// web/db/posts/aiSuggestions.js — ข้อเสนอจาก AI ที่เก็บไว้อ่านซ้ำได้ (โควต + หัวข้อ + ไอเดียภาพ)
//
// ทำไมต้องเป็นตารางแยก ไม่ใช่คอลัมน์บน post_episodes:
//   ทุก UPDATE บน post_episodes bump `updated_at` = lockToken ของ PostEditor หมดอายุ
//   → ขอแคปชันทีไร autosave เด้ง 409 ทุกที (bug-071) · ที่นี่เขียนแล้วไม่แตะโพสต์เลย
//
// ของพวกนี้ **ไม่ใช่ revision** — ไม่เคยเข้าเนื้อหาโพสต์ จึงไม่ควรปนใน post_revisions
// ที่มีปุ่ม "กู้คืนฉบับนี้" (กู้คืนแคปชันทับเนื้อหา = ไม่มีความหมาย)
import pool from '../index.js'

/** เก็บ 1 ชุด (1 ครั้งที่กดขอ) — payload = { quotes, headlines, imageIdeas, hashtags, articleTips } (ทุกฟิลด์เป็น array ของ string) */
export async function saveSuggestion({ episodeId, kind = 'caption', payload, userId = null, userName = null }) {
  const { rows } = await pool.query(
    `INSERT INTO post_ai_suggestions (episode_id, kind, payload, created_by_user_id, created_by_name)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING id, kind, payload, created_by_name, created_at`,
    [episodeId, kind, JSON.stringify(payload), userId, userName]
  )
  return rows[0]
}

/** ชุดที่เคยขอไว้ ใหม่สุดขึ้นก่อน */
export async function listSuggestions(episodeId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT s.id, s.kind, s.payload, s.created_by_name, s.created_at,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''), u.username) AS author_name
       FROM post_ai_suggestions s
       LEFT JOIN users u ON u.id = s.created_by_user_id
      WHERE s.episode_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2`,
    [episodeId, limit]
  )
  return rows
}

/** ลบทีละชุด — ผูก episode_id ไว้ด้วย กันลบข้ามโพสต์ด้วย id เดา */
export async function deleteSuggestion(id, episodeId) {
  const { rowCount } = await pool.query(
    `DELETE FROM post_ai_suggestions WHERE id = $1 AND episode_id = $2`,
    [id, episodeId]
  )
  return rowCount > 0
}
