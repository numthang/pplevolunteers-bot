// สโมค: ตะเข็บ case_assignees → การ์ด kanban หลังเฟส B (ทั้งฝั่งเว็บและฝั่งบอท)
//   node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanCaseSync.mjs
// สร้างเคสปลอมด้วย SQL ตรงๆ (ไม่ผ่าน createCase จึงไม่ยิง Discord) แล้วลบทิ้งท้ายสุด
import { mirrorEntityCard, syncCaseCardPeople } from '../../web/db/kanban/links.js'
import { getCard } from '../../web/db/kanban/cards.js'
import pool from '../../web/db/index.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { syncCaseCardPeopleFromBot } = require('../../db/kanbanCards.js')

const ORG = 1, ALICE = 1, BOB = 2, CAROL = 3
let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}
// ⚠️ getCard คืน **สถานะสด** ที่คำนวณจาก cases.status ไม่ใช่คอลัมน์ — invariant ของ trigger
//    อยู่ที่คอลัมน์ ต้องอ่านดิบเท่านั้น (นี่คือกับดักที่ทำให้เทสรอบแรกฟ้องผิด)
const rawStatus = async (id) =>
  (await pool.query(`SELECT status_type FROM kanban_cards WHERE id = $1`, [id])).rows[0].status_type

const setAssignees = async (caseId, ids) => {
  await pool.query(`DELETE FROM case_assignees WHERE case_id = $1`, [caseId])
  for (const u of ids) {
    await pool.query(
      `INSERT INTO case_assignees (case_id, org_id, user_id) VALUES ($1, $2, $3)`, [caseId, ORG, u])
  }
}

let caseId = null, cardId = null
try {
  const { rows } = await pool.query(
    `INSERT INTO cases (org_id, ref, province, status, source, complainant_name)
     VALUES ($1, 'SMOKE-B-' || floor(random() * 1e6)::text, 'ราชบุรี', 'open', 'web', 'สโมคเฟส B')
     RETURNING id, ref`, [ORG])
  caseId = rows[0].id
  console.log(`\n── เคสทดสอบ ${rows[0].ref} (id=${caseId}) ──`)

  cardId = await mirrorEntityCard(ORG, 'case', { id: caseId, title: 'สโมค: เคสเฟส B', assigneeIds: [] }, ALICE)
  ok('mirror สร้างการ์ดให้เคสได้', Boolean(cardId), `card=${cardId}`)
  let card = await getCard(ORG, cardId)
  ok('เคสยังไม่มีคนรับ → การ์ด backlog', (await rawStatus(cardId)) === 'backlog' && card.assignee_ids.length === 0)

  console.log('\n── ฝั่งเว็บ: syncCaseCardPeople ──')
  await setAssignees(caseId, [BOB, CAROL])
  ok('sync คืน true', await syncCaseCardPeople(caseId))
  card = await getCard(ORG, cardId)
  ok('ผู้รับผิดชอบ 2 คนลงการ์ดครบ', card.assignee_ids.length === 2, card.assignee_ids.join(','))

  // ⭐ ท่าที่ trigger ธรรมดาจะพัง: เปลี่ยนชุดคนทั้งชุด (DELETE ก่อน INSERT ในทรานแซกชันเดียว)
  await pool.query(`UPDATE kanban_cards SET status_type = 'doing' WHERE id = $1`, [cardId])
  await setAssignees(caseId, [ALICE])
  await syncCaseCardPeople(caseId)
  card = await getCard(ORG, cardId)
  const raw = await rawStatus(cardId)
  ok('สลับคนทั้งชุดแล้วคอลัมน์สถานะไม่ถูก clamp', raw === 'doing', `คอลัมน์=${raw} · สด=${card.status_type}`)
  ok('เหลือคนใหม่คนเดียว', card.assignee_ids.length === 1 && card.assignee_ids[0] === ALICE)

  console.log('\n── ฝั่งบอท: syncCaseCardPeopleFromBot (สำเนา CJS) ──')
  await setAssignees(caseId, [BOB, CAROL, ALICE])
  ok('sync ฝั่งบอทคืน true', await syncCaseCardPeopleFromBot(caseId))
  card = await getCard(ORG, cardId)
  ok('ได้ผลเหมือนฝั่งเว็บเป๊ะ', card.assignee_ids.length === 3, card.assignee_ids.join(','))

  console.log('\n── ถอดคนสุดท้ายที่ต้นทาง → การ์ดกลับกอง "รอทำ" เอง ──')
  await setAssignees(caseId, [])
  await syncCaseCardPeople(caseId)
  card = await getCard(ORG, cardId)
  ok('ไม่เหลือใครในการ์ด', card.assignee_ids.length === 0)
  const raw2 = await rawStatus(cardId)
  ok('trigger clamp คอลัมน์เป็น backlog', raw2 === 'backlog', raw2)
} catch (e) {
  fail++
  console.error('\n💥 หยุดกลางทาง:', e.message)
} finally {
  if (cardId) await pool.query(`DELETE FROM kanban_cards WHERE id = $1`, [cardId])
  if (caseId) await pool.query(`DELETE FROM cases WHERE id = $1`, [caseId])
  console.log('\n🧹 ลบเคส+การ์ดทดสอบแล้ว')
  await pool.end()
  console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : `\n✅ ผ่านหมด`)
  process.exit(fail ? 1 : 0)
}
