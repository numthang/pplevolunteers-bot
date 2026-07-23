import pool from '@/db/index.js'

/**
 * logAction({ orgId, app, action, actorId?, targetId?, meta? })
 *
 * - `orgId`   INT → orgs.id      (audit ผูกกับ tenant ไม่ใช่ Discord guild)
 * - `actorId` INT → users.id     (คนทำ — ไม่ใช่ discord snowflake แล้ว)
 * - `targetId` **polymorphic โดยตั้งใจ** เก็บเป็น string: case ref ('70-69-2D8E') /
 *   'u<id>' ของคนที่ถูกตั้งยศ / member_id ของ calling → อย่าแปลงเป็น INT
 *
 * ⚠️ fire-and-forget — ไม่ throw (audit ล้มต้องไม่ทำให้ flow หลักพัง)
 * แต่ "ไม่ throw" ≠ "ไม่ต้องรู้": เคยกลืน NOT NULL violation จน log หายเงียบ
 * ทั้ง feature (calling/dial ส่ง orgId เข้า param ชื่อ guildId → undefined) →
 * เลย console.error ไว้ให้เห็นใน log แทนที่จะกลืนเปล่าๆ
 */
export async function logAction({ orgId, app, action, actorId = null, targetId = null, meta = null }) {
  if (!orgId) {
    console.error('[audit] ข้าม log เพราะไม่มี orgId', { app, action })
    return
  }
  pool.query(
    `INSERT INTO audit_logs (org_id, app, action, actor_id, target_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, app, action, actorId || null, targetId ? String(targetId) : null, meta ? JSON.stringify(meta) : null],
  ).catch(err => console.error('[audit] เขียน log ไม่สำเร็จ', { app, action }, err.message))
}
