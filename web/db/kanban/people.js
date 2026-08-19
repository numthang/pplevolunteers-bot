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
