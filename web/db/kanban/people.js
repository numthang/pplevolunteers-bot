// web/db/kanban/people.js — ค้นคนใน org ไว้เลือกเป็นเจ้าภาพ/คนช่วย
//
// ⚠️ **ชื่อที่คืนต้องเป็นสูตรเดียวกับที่การ์ดโชว์เป๊ะ** ไม่งั้นเลือกคนจากกล่องค้นหาแล้วการ์ดขึ้นอีกชื่อ
//    → ทั้งคู่เรียก displayNameSql() ตัวเดียวกันจาก db/displayName.js แล้ว ไม่ต้องไล่แก้ 2 ที่อีก
//
// ค้นได้กว้างกว่าที่โชว์ (แมตช์ display_name/username/email) — คนพิมพ์ชื่อเล่นที่ตั้งไว้ใน org ก็ควรเจอ
import pool from '../index.js'
import { displayNameSql } from '../displayName.js'

const DISPLAY_NAME = displayNameSql('u', '$1')

/** ค้นสมาชิก active ของ org · เรียกจาก API ที่กันคำค้นสั้นกว่า 2 ตัวไว้แล้ว */
export async function searchKanbanPeople(orgId, q, limit = 20) {
  const term = `%${q.trim()}%`
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (om.user_id)
            om.user_id AS "userId",
            ${DISPLAY_NAME} AS name,
            -- @username ไว้แยกคนชื่อซ้ำ — org 1 มี "Ploy" 6 คน กดผิดคนแล้วรู้ตัวยาก
            -- (เลือก username ไม่ใช่ email/discord_id — 2 อย่างนั้นคือข้อมูลส่วนตัวของคนทั้ง org)
            u.username
       FROM org_members om
       JOIN users u ON u.id = om.user_id
      WHERE om.org_id = $1
        AND om.status = 'active'
        AND (om.display_name ILIKE $2 OR u.username ILIKE $2 OR u.email ILIKE $2
             OR TRIM(CONCAT_WS(' ', u.firstname, u.lastname)) ILIKE $2)
      ORDER BY om.user_id
      LIMIT $3`,
    [orgId, term, limit]
  )
  // เรียงตามชื่อที่ผู้ใช้เห็นจริง — DISTINCT ON บังคับให้ ORDER BY ขึ้นต้นด้วย user_id เลยเรียงซ้ำที่นี่
  return rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'))
}

const PROFILE_NAME = displayNameSql('u', '$1')

/**
 * โปรไฟล์คร่าวๆ ของคน 1 คน — ใช้เปิดกล่องลอยตอนกดชื่อเจ้าภาพ/คนช่วย
 *
 * ⚠️ ต้อง gate ด้วยแถว org_members ก่อนเสมอ — displayNameSql() fallback ไปที่ users.firstname/username
 *    (ไม่ผูก org) และ users.avatar เป็นคอลัมน์ global เหมือนกัน ถ้าไม่เช็คว่า userId นี้เคยอยู่ org นี้จริง
 *    endpoint จะกลายเป็น user-enumeration ข้าม org (ใครก็ไล่เลข userId ดูชื่อ+รูปคนทั้งระบบได้)
 *    ไม่บังคับ status='active' — คนที่ออกจาก org แล้วแต่ยังถืองานเก่าอยู่ก็ควรเปิดโปรไฟล์ได้
 */
export async function getPersonProfile(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT u.id AS "userId",
            ${PROFILE_NAME} AS name,
            u.username,
            COALESCE(u.avatar, (
              SELECT om2.avatar FROM org_members om2
               WHERE om2.user_id = u.id AND om2.org_id = $1
               ORDER BY om2.id LIMIT 1
            )) AS avatar,
            (SELECT array_agg(DISTINCT r) FILTER (WHERE r <> '')
               FROM org_members om3, LATERAL unnest(string_to_array(COALESCE(om3.roles, ''), ',')) AS role(r)
              WHERE om3.user_id = u.id AND om3.org_id = $1) AS roles,
            (SELECT COUNT(*) FROM kanban_cards c
              WHERE c.org_id = $1 AND c.archived_at IS NULL
                AND (c.owner_user_id = u.id OR EXISTS (
                      SELECT 1 FROM kanban_card_helpers h WHERE h.card_id = c.id AND h.user_id = u.id))
            ) AS "cardCount"
       FROM users u
      WHERE u.id = $2
        AND EXISTS (SELECT 1 FROM org_members om WHERE om.user_id = u.id AND om.org_id = $1)`,
    [orgId, userId]
  )
  return rows[0] || null
}
