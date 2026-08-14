// smoke test ชั้น DB ของ kanban ก้อน 1 — รันกับฐานจริง แล้วลบของที่สร้างทิ้งท้ายสุด
import * as db from '../../web/db/kanban/cards.js'
import pool from '../../web/db/index.js'
import { checkStatusTransition, formatRef } from '../../web/lib/kanbanAccess.js'

const ORG = 1, ALICE = 1, BOB = 2, CAROL = 3
const made = []
let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

try {
  console.log('\n── สร้างการ์ด + จองเลข ref ──')
  const a = await db.createCard(ORG, { title: 'สโมค: ไม่มีเจ้าภาพ' }, ALICE)
  made.push(a.id)
  ok('สร้างได้ + ได้เลข ref', a.ref_no > 0, formatRef(a.ref_no))
  ok('ไม่มีเจ้าภาพ → backlog อัตโนมัติ', a.status_type === 'backlog', a.status_type)

  const b = await db.createCard(ORG, { title: 'สโมค: มีเจ้าภาพ', ownerUserId: BOB, dueAt: '2026-08-20T17:00' }, ALICE)
  made.push(b.id)
  ok('มีเจ้าภาพ → doing อัตโนมัติ', b.status_type === 'doing', b.status_type)
  ok('เลข ref เดินหน้าไม่ซ้ำ', b.ref_no === a.ref_no + 1, `${a.ref_no} → ${b.ref_no}`)
  ok('owner_name ติดมาด้วย', Boolean(b.owner_name), b.owner_name)

  console.log('\n── timezone: due_at ต้องไม่ +7 ──')
  const local = new Date(b.due_at).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' })
  ok('17:00 ที่กรอก = 17:00 ในไทย', local.includes('17:00'), `เก็บได้ ${local}`)

  console.log('\n── จอง ref พร้อมกัน 5 ใบ (แข่งกันจริง) ──')
  const race = await Promise.all([1, 2, 3, 4, 5].map(i =>
    db.createCard(ORG, { title: `สโมค: แข่งกัน ${i}` }, ALICE)))
  race.forEach(r => made.push(r.id))
  const refs = race.map(r => r.ref_no)
  ok('ไม่มีเลขซ้ำ', new Set(refs).size === 5, refs.join(','))

  console.log('\n── optimistic lock ──')
  const fresh = await db.getCard(ORG, b.id)
  const good = await db.updateCard(ORG, b.id, { title: 'สโมค: แก้ชื่อแล้ว' }, { lockToken: fresh.lock_token })
  ok('token ถูก → แก้ผ่าน', good.ok === true && good.card.title === 'สโมค: แก้ชื่อแล้ว')
  const stale = await db.updateCard(ORG, b.id, { title: 'ควรโดนบล็อก' }, { lockToken: fresh.lock_token })
  ok('token เก่า → conflict', stale.ok === false && stale.conflict === true)
  const noToken = await db.updateCard(ORG, b.id, { title: 'ควรโดนบล็อก' }, { lockToken: null })
  ok('ไม่ส่ง token → conflict (bug-071)', noToken.ok === false && noToken.conflict === true)
  const after = await db.getCard(ORG, b.id)
  ok('เนื้อหาไม่ถูกทับตอน conflict', after.title === 'สโมค: แก้ชื่อแล้ว', after.title)

  console.log('\n── กติกาเจ้าภาพ ──')
  ok('ไม่มีเจ้าภาพ → doing = บล็อกตั้งแต่ชั้น lib',
    checkStatusTransition(a, 'doing').reason === 'needOwner')
  let dbBlocked = false
  try { await db.setCardStatus(ORG, a.id, 'doing') } catch (e) { dbBlocked = e.code === '23514' }
  ok('DB CHECK เป็นตาข่ายสุดท้ายจริง', dbBlocked)

  console.log('\n── สถานะ + คนช่วย + งานย่อย ──')
  const done = await db.setCardStatus(ORG, b.id, 'done')
  ok('ปิดงาน → completed_at ถูกเซ็ต', Boolean(done.completed_at))
  const reopen = await db.setCardStatus(ORG, b.id, 'doing')
  ok('เปิดงานใหม่ → completed_at ถูกล้าง', reopen.completed_at === null)

  let c = await db.addHelper(ORG, b.id, CAROL)
  ok('เพิ่มคนช่วยได้', c.helper_ids.includes(CAROL))
  c = await db.addHelper(ORG, b.id, CAROL)
  ok('เพิ่มซ้ำไม่บวม', c.helpers.length === 1)
  c = await db.removeHelper(ORG, b.id, CAROL)
  ok('ถอดคนช่วยได้', c.helper_ids.length === 0)

  const i1 = await db.addChecklistItem(ORG, b.id, 'จองรถ')
  const i2 = await db.addChecklistItem(ORG, b.id, 'ทำป้าย')
  ok('เพิ่มงานย่อยเรียงลำดับ', i2.sort_order > i1.sort_order)
  await db.setChecklistDone(ORG, i1.id, true)
  const withCount = await db.getCard(ORG, b.id)
  ok('นับงานย่อยถูก', Number(withCount.checklist_done) === 1 && Number(withCount.checklist_total) === 2,
    `${withCount.checklist_done}/${withCount.checklist_total}`)

  console.log('\n── การบ้านของฉัน ──')
  await db.addHelper(ORG, a.id, BOB)
  const my = await db.listMyCards(ORG, BOB)
  ok('งานที่ฉันเป็นเจ้าภาพเข้ากอง mine', my.mine.some(r => r.id === b.id))
  ok('งานที่ฉันช่วยเข้ากอง helping',    my.helping.some(r => r.id === a.id))
  ok('ไม่ปนกัน', !my.mine.some(r => r.id === a.id))

  console.log('\n── กันข้าม org ──')
  ok('org อื่นอ่านการ์ดนี้ไม่เห็น', (await db.getCard(8, b.id)) === null)
  ok('เก็บเข้ากรุข้าม org ไม่ได้', (await db.archiveCard(8, b.id)) === false)

  console.log('\n── เก็บเข้ากรุ ──')
  ok('เก็บเข้ากรุได้', (await db.archiveCard(ORG, b.id)) === true)
  ok('เก็บซ้ำคืน false', (await db.archiveCard(ORG, b.id)) === false)
  const my2 = await db.listMyCards(ORG, BOB)
  ok('หายจากการบ้านของฉัน', !my2.mine.some(r => r.id === b.id))

  console.log('\n── หาด้วยเลข ref ──')
  const byRef = await db.getCardByRef(ORG, a.ref_no)
  ok('K-xx หาเจอ', byRef?.id === a.id)
} finally {
  if (made.length) {
    await pool.query(`DELETE FROM kanban_cards WHERE id = ANY($1)`, [made])
    console.log(`\n🧹 ลบการ์ดทดสอบ ${made.length} ใบ`)
  }
  const { rows } = await pool.query(`SELECT count(*)::int n FROM kanban_cards`)
  console.log(`   เหลือในตาราง: ${rows[0].n} ใบ`)
  await pool.end()
  console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : `\n✅ ผ่านหมด`)
  process.exit(fail ? 1 : 0)
}
