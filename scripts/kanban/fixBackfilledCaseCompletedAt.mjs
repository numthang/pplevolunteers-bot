// แก้ `completed_at` ของการ์ด kanban ที่ผูก **เคสเก่าที่นำเข้าจากกระทู้ Discord** ให้เป็นวันตั้งเรื่องจริง
//
//   node --env-file=.env scripts/kanban/fixBackfilledCaseCompletedAt.mjs [--dry]
//
// PRODUCTION:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
//     node --env-file=.env scripts/kanban/fixBackfilledCaseCompletedAt.mjs'
//
// ── ปัญหาที่แก้ ──────────────────────────────────────────────────────────────
// ทีมกำลังไล่ปิดเคสเก่าย้อนหลัง 3 ปีทีละใบผ่านหน้า /cases · ทุกครั้งที่กด resolved/rejected
// `db/cases.js:updateStatus()` จะเซ็ต `completed_at = now()` ให้การ์ดที่ผูกเคสนั้น
// → เคสปี 2023 กลายเป็น "เสร็จวันนี้" ไปกองบนสุดของช่อง "เสร็จ" ทั้งที่เป็นเรื่องเก่า
//
// ⛔ **ไม่แก้ที่ `updateStatus()`** — พฤติกรรมนั้นถูกแล้วสำหรับเคสจริงที่ใช้เวลาทำจริง
//    ที่ผิดคือช่วง backfill เท่านั้น สคริปต์นี้จึงเป็น "ตัวตามเก็บ" ไม่ใช่การแก้ logic
//
// ── ทำไมเป็น script ไม่ใช่ migration (เคาะ 2026-09-04) ────────────────────────
// node-pg-migrate รันไฟล์เดิมได้ครั้งเดียวแล้วจำว่าทำแล้วถาวร แต่ปัญหานี้ **งอกใหม่ทุกครั้ง**
// ที่มีคนปิดเคสเก่าเพิ่ม → ต้องรันซ้ำได้ · ของเดิมเคยทำเป็น migration
// (1788490304371_correct-completed-at-… ซึ่งรันบน dev ไปแล้ว) เลยใช้ซ้ำไม่ได้อีก
//
// ⭐ รันซ้ำได้ปลอดภัย: `IS DISTINCT FROM` ทำให้แถวที่ถูกอยู่แล้วไม่ถูกแตะ (updated_at ไม่ขยับด้วย)
//
// ขอบเขต: เฉพาะ `cases.source = 'discord'` เท่านั้น — เคสที่แจ้งผ่านเว็บในอนาคต `now()` คือค่าที่ถูก
import pool from '../../web/db/index.js'

const dry = process.argv.includes('--dry')

const WHERE = `
    FROM kanban_card_links l
    JOIN cases cs ON cs.id = l.entity_id
   WHERE l.card_id = c.id
     AND l.entity_type = 'case'
     AND cs.source = 'discord'
     AND cs.status IN ('resolved', 'rejected')
     AND c.completed_at IS DISTINCT FROM cs.created_at`

try {
  const { rows: [before] } = await pool.query(
    `SELECT count(*)::int n FROM kanban_cards c WHERE EXISTS (SELECT 1 ${WHERE})`)

  if (before.n === 0) {
    console.log('✅ ไม่มีการ์ดที่ต้องแก้ — completed_at ตรงกับวันตั้งเรื่องหมดแล้ว')
  } else if (dry) {
    const { rows } = await pool.query(`
      SELECT cs.ref, cs.created_at::date AS วันตั้งเรื่อง, c.completed_at::date AS ที่บันทึกไว้ตอนนี้
        FROM kanban_cards c
        JOIN kanban_card_links l ON l.card_id = c.id
        JOIN cases cs ON cs.id = l.entity_id
       WHERE l.entity_type = 'case' AND cs.source = 'discord'
         AND cs.status IN ('resolved','rejected')
         AND c.completed_at IS DISTINCT FROM cs.created_at
       ORDER BY cs.created_at LIMIT 20`)
    console.log(`[DRY RUN] จะแก้ ${before.n} ใบ · ตัวอย่าง 20 ใบแรก:`)
    console.table(rows)
    console.log('รันจริง: เอา --dry ออก')
  } else {
    console.log(`พบ ${before.n} ใบที่ต้องแก้ — กำลังอัปเดต...`)
    const { rowCount } = await pool.query(
      `UPDATE kanban_cards c SET completed_at = cs.created_at, updated_at = now() ${WHERE}`)
    console.log(`Done: แก้ไป ${rowCount} ใบ`)
  }
} catch (e) {
  console.error('ล้มเหลว:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
