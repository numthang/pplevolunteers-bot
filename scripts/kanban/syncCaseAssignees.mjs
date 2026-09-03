// กวาดผู้รับผิดชอบของการ์ดที่ผูกเคสให้ตรงกับ `case_assignees` — **รันครั้งเดียวตอน deploy**
//
//   node --env-file=.env scripts/kanban/syncCaseAssignees.mjs --org 1 [--dry]
//
// PRODUCTION:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
//     node --env-file=.env scripts/kanban/syncCaseAssignees.mjs --org 1 --dry'
//
// ── ทำไมต้องมี ─────────────────────────────────────────────────────
// ก่อน 2026-08-31 เจ้าภาพเคยถูกเก็บ 2 ที่โดยไม่มีใคร sync:
//   `case_assignees` (ต้นทาง) ↔ `kanban_cards.owner_user_id` + `kanban_card_helpers` (สำเนา)
// ⭐ 2026-09-03 (เฟส B): สำเนาเหลือตารางเดียว `kanban_card_assignees` แล้ว — สคริปต์นี้อัปเดตตาม
// ตอนนี้ทุกทางเข้าผ่าน `web/lib/caseAssign.js` แล้ว แต่ **ของเก่าที่ดริฟต์ไปแล้วไม่หายเอง**
//
// ⭐ ดัน "ขึ้น" ก่อน แล้วค่อย mirror "ลง" — ห้ามสลับลำดับ
//    คนที่กด "ลงมือด้วย" บนบอร์ดก่อนหน้านี้อยู่แค่สำเนาฝั่ง kanban ไม่เคยลงถึงต้นทาง
//    ถ้า mirror ลงอย่างเดียว = กวาดคนพวกนั้นทิ้งเงียบๆ (งานที่เขารับไว้หายจาก "การบ้านของฉัน")
//
// ⭐ รันซ้ำได้ปลอดภัย — รอบสองต้องรายงาน 0/0 เสมอ
import { syncCaseCardPeople } from '../../web/db/kanban/links.js'
import pool from '../../web/db/index.js'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const orgId = Number(arg('org', 1))
const dry = process.argv.includes('--dry')

// คนที่อยู่ในการ์ดแต่ยังไม่อยู่ในเคส
const MISSING_UPSTREAM = `
  SELECT DISTINCT l.entity_id AS case_id, p.user_id
    FROM kanban_card_links l
    JOIN kanban_cards c ON c.id = l.card_id AND c.org_id = $1
    JOIN cases cs ON cs.id = l.entity_id AND cs.org_id = $1
    JOIN kanban_card_assignees p ON p.card_id = c.id
   WHERE l.entity_type = 'case'
     AND NOT EXISTS (SELECT 1 FROM case_assignees a
                      WHERE a.case_id = l.entity_id AND a.user_id = p.user_id)`

// เคสที่สำเนาในการ์ดไม่ตรงต้นทาง (ทิศ mirror ลง)
const DRIFTED = `
  SELECT DISTINCT l.entity_id AS case_id
    FROM kanban_card_links l
    JOIN kanban_cards c ON c.id = l.card_id AND c.org_id = $1
   WHERE l.entity_type = 'case'
     AND (
       -- มีในการ์ด แต่ไม่มีในเคส
       EXISTS (SELECT 1 FROM kanban_card_assignees k
                WHERE k.card_id = c.id
                  AND NOT EXISTS (SELECT 1 FROM case_assignees a
                                   WHERE a.case_id = l.entity_id AND a.user_id = k.user_id))
       -- มีในเคส แต่ไม่มีในการ์ด
       OR EXISTS (SELECT 1 FROM case_assignees a
                   WHERE a.case_id = l.entity_id
                     AND NOT EXISTS (SELECT 1 FROM kanban_card_assignees k
                                      WHERE k.card_id = c.id AND k.user_id = a.user_id))
     )`

const { rows: missing } = await pool.query(MISSING_UPSTREAM, [orgId])
console.log(`ขั้น 1 — คนในการ์ดที่ยังไม่เป็นผู้รับผิดชอบเคส: ${missing.length} รายการ`)

if (missing.length && !dry) {
  for (const m of missing) {
    await pool.query(
      `INSERT INTO case_assignees (case_id, org_id, user_id)
       VALUES ($1, $2, $3) ON CONFLICT (case_id, user_id) DO NOTHING`,
      [m.case_id, orgId, m.user_id],
    )
  }
  console.log(`  ดันขึ้นต้นทางแล้ว ${missing.length} รายการ`)
}

const { rows: drifted } = await pool.query(DRIFTED, [orgId])
console.log(`ขั้น 2 — การ์ดที่สำเนาคนไม่ตรงต้นทาง: ${drifted.length} ใบ`)

if (drifted.length && !dry) {
  let done = 0, failed = 0
  for (const d of drifted) {
    if (await syncCaseCardPeople(d.case_id)) done++
    else failed++
    process.stdout.write(`\r  ${done + failed}/${drifted.length} (${failed} ล้มเหลว)`)
  }
  console.log(`\nDone: sync ${done} ใบ, ล้มเหลว ${failed}`)
}

if (dry) console.log('(--dry: ยังไม่เขียนอะไรลง DB)')
await pool.end()
