/**
 * โควตาอ่านบัตรด้วย AI ต่อคนต่อวัน
 *
 * ทำไมต้องมี: เดิม /api/docs/id-card/ocr กันด้วย canManageDocs (คนใน org ที่ไว้ใจได้)
 * พอเปิดให้ "เจ้าของใบ" ยิงได้ด้วย sign token ผู้เรียกก็กลายเป็นสมาชิกหลักพัน
 * ที่ถือลิงก์ — ยิงรัวได้เท่าที่อยาก และแต่ละครั้งคือค่า vision model จริง
 *
 * ลอกโครงจาก lib/postsAiQuota.js (คนละ key คนละงบ) — เก็บใน user_config
 * key `docs_ocr_quota` = {"date":"2026-08-26","count":3} · วันเปลี่ยน = นับใหม่ ไม่ต้องมี cron
 * ไม่ atomic — ยิงพร้อมกันแล้วเกิน 1-2 ครั้งรับได้ ไม่ใช่เงิน
 */
import pool from '@/db/index.js'

const KEY = 'docs_ocr_quota'

// ถ่ายไม่ติด/อ่านเพี้ยนแล้วถ่ายใหม่เป็นเรื่องปกติมาก — 15 ครั้ง/วันเผื่อไว้เยอะพอ
// สำหรับคนเซ็นใบเดียว แต่ยังกันคนยิงรัวเป็นร้อย
export const DOCS_OCR_DAILY_LIMIT = 15

/** YYYY-MM-DD ตามเวลาไทย — server รันบน UTC (ดู gotcha timezone ใน CLAUDE.md) */
function todayTH() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * นับ 1 ครั้งถ้ายังไม่เต็ม — เรียก **ก่อน** ยิง AI
 * (ล้มแล้วเสียโควตา 1 ครั้ง ดีกว่าเปิดช่องให้ยิงรัวโดยไม่นับ)
 */
export async function consumeDocsOcrQuota(userId) {
  const { rows } = await pool.query(
    `SELECT value FROM user_config WHERE user_id = $1 AND "key" = $2`,
    [userId, KEY]
  )
  const raw = rows[0]?.value
  const obj = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
  const count = obj && obj.date === todayTH() ? Number(obj.count) || 0 : 0

  if (count >= DOCS_OCR_DAILY_LIMIT) return { ok: false, used: count, limit: DOCS_OCR_DAILY_LIMIT }

  await pool.query(
    `INSERT INTO user_config (user_id, "key", value, updated_at)
     VALUES ($1, $2, $3::json, now())
     ON CONFLICT (user_id, "key") DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [userId, KEY, JSON.stringify({ date: todayTH(), count: count + 1 })]
  )
  return { ok: true, remaining: DOCS_OCR_DAILY_LIMIT - count - 1 }
}
