/**
 * โควตา AI ต่อคนต่อวัน (grill ข้อ 13) — key เดียวของโปรเจกต์ ต้องกันบิลพุ่งจากสมาชิกหลักพัน
 *
 * เก็บใน `user_config` key `posts_ai_quota` = {"date":"2026-07-29","count":3}
 * วันเปลี่ยน = เริ่มนับใหม่ (ไม่ต้องมี cron ล้าง) · **วันตามเวลาไทย** ไม่ใช่ UTC
 * ไม่ atomic — โควตาไม่ใช่เงิน ยิงพร้อมกันแล้วเกิน 1-2 ครั้งรับได้
 */
import pool from '@/db/index.js'

export { AI_DAILY_LIMIT } from './postsAccess.js'
import { AI_DAILY_LIMIT } from './postsAccess.js'

const KEY = 'posts_ai_quota'

/** YYYY-MM-DD ตามเวลาไทย — server รันบน UTC (ดู gotcha timezone ใน CLAUDE.md) */
export function todayTH() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function read(userId) {
  const { rows } = await pool.query(
    `SELECT value FROM user_config WHERE user_id = $1 AND "key" = $2`,
    [userId, KEY]
  )
  const raw = rows[0]?.value
  const obj = typeof raw === 'string' ? safeParse(raw) : raw
  if (!obj || obj.date !== todayTH()) return { date: todayTH(), count: 0 }
  return { date: obj.date, count: Number(obj.count) || 0 }
}

function safeParse(s) { try { return JSON.parse(s) } catch { return null } }

export async function getAiUsage(userId) {
  const { count } = await read(userId)
  return { used: count, limit: AI_DAILY_LIMIT, remaining: Math.max(0, AI_DAILY_LIMIT - count) }
}

/**
 * นับ 1 ครั้งถ้ายังไม่เต็ม — เรียก **ก่อน** ยิง AI (ล้มแล้วเสียโควตา 1 ครั้งดีกว่าเปิดช่องยิงรัว)
 * @returns {{ok:true, remaining:number} | {ok:false, used:number, limit:number}}
 */
export async function consumeAiQuota(userId) {
  const { count } = await read(userId)
  if (count >= AI_DAILY_LIMIT) return { ok: false, used: count, limit: AI_DAILY_LIMIT }

  const next = { date: todayTH(), count: count + 1 }
  await pool.query(
    `INSERT INTO user_config (user_id, "key", value, updated_at)
     VALUES ($1, $2, $3::json, now())
     ON CONFLICT (user_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [userId, KEY, JSON.stringify(next)]
  )
  return { ok: true, remaining: AI_DAILY_LIMIT - next.count }
}
