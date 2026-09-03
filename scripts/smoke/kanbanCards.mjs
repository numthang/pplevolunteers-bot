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
  const a = await db.createCard(ORG, { title: 'สโมค: ไม่มีคนรับ' }, ALICE)
  made.push(a.id)
  ok('สร้างได้ + ได้เลข ref', a.ref_no > 0, formatRef(a.ref_no))
  ok('ไม่มีคนรับ → backlog อัตโนมัติ', a.status_type === 'backlog', a.status_type)

  const b = await db.createCard(ORG, { title: 'สโมค: มีคนรับ', assigneeIds: [BOB], dueAt: '2026-08-20T17:00' }, ALICE)
  made.push(b.id)
  ok('มีคนรับ → doing อัตโนมัติ', b.status_type === 'doing', b.status_type)
  ok('เลข ref เดินหน้าไม่ซ้ำ', b.ref_no === a.ref_no + 1, `${a.ref_no} → ${b.ref_no}`)
  ok('ชื่อผู้รับผิดชอบติดมาด้วย', b.assignees.length === 1 && Boolean(b.assignees[0].name), b.assignees[0]?.name)

  // ⭐ เฟส B: สร้างพร้อมผู้รับผิดชอบหลายคนได้ในทรานแซกชันเดียว (trigger เป็น DEFERRED จึงไม่ติดด่านตัวเอง)
  const multi = await db.createCard(ORG, { title: 'สโมค: รับหลายคน', assigneeIds: [BOB, CAROL] }, ALICE)
  made.push(multi.id)
  ok('สร้างพร้อมผู้รับผิดชอบ 2 คน', multi.assignee_ids.length === 2 && multi.status_type === 'doing',
     multi.assignee_ids.join(','))
  ok('เรียงตาม assigned_at (ใครมาก่อนขึ้นก่อน)', multi.assignees[0].user_id === BOB)

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

  console.log('\n── กติกาผู้รับผิดชอบ ──')
  ok('ไม่มีคนรับ → doing = บล็อกตั้งแต่ชั้น lib',
    checkStatusTransition(a, 'doing').reason === 'needAssignee')
  let dbBlocked = false
  try { await db.setCardStatus(ORG, a.id, 'doing') } catch (e) { dbBlocked = e.code === '23514' }
  ok('trigger ใน DB เป็นตาข่ายสุดท้ายจริง', dbBlocked)

  console.log('\n── สถานะ + คนช่วย + งานย่อย ──')
  const done = await db.setCardStatus(ORG, b.id, 'done')
  ok('ปิดงาน → completed_at ถูกเซ็ต', Boolean(done.completed_at))
  const reopen = await db.setCardStatus(ORG, b.id, 'doing')
  ok('เปิดงานใหม่ → completed_at ถูกล้าง', reopen.completed_at === null)

  let c = await db.addAssignee(ORG, b.id, CAROL)
  ok('เพิ่มผู้รับผิดชอบได้', c.assignee_ids.includes(CAROL))
  c = await db.addAssignee(ORG, b.id, CAROL)
  ok('เพิ่มซ้ำไม่บวม', c.assignee_ids.filter(x => x === CAROL).length === 1)
  c = await db.removeAssignee(ORG, b.id, CAROL)
  ok('ถอดออกได้', !c.assignee_ids.includes(CAROL))
  ok('ยังเหลือคนอื่น → สถานะไม่ตก', c.status_type === 'doing', c.status_type)

  console.log('\n── ⭐ trigger: ถอดคนสุดท้ายออก → การ์ดกลับกอง "รอทำ" เอง ──')
  const solo = await db.createCard(ORG, { title: 'สโมค: คนเดียว', assigneeIds: [CAROL] }, ALICE)
  made.push(solo.id)
  const empty = await db.removeAssignee(ORG, solo.id, CAROL)
  ok('ไม่เหลือใคร → clamp เป็น backlog', empty.status_type === 'backlog', empty.status_type)
  ok('completed_at ถูกล้างด้วย', empty.completed_at === null)

  console.log('\n── ⭐ trigger ต้อง DEFERRED: สลับตัวคนในทรานแซกชันเดียว ห้ามดันการ์ดตกกอง ──')
  //    (นี่คือท่าที่ syncCaseCardPeople ใช้จริง — DELETE ก่อน INSERT มีจังหวะกลางที่เหลือ 0 แถว)
  const swap = await db.createCard(ORG, { title: 'สโมค: สลับคน', assigneeIds: [BOB] }, ALICE)
  made.push(swap.id)
  const cl = await pool.connect()
  try {
    await cl.query('BEGIN')
    await cl.query(`DELETE FROM kanban_card_assignees WHERE card_id = $1`, [swap.id])
    await cl.query(`INSERT INTO kanban_card_assignees (card_id, user_id) VALUES ($1, $2)`, [swap.id, CAROL])
    await cl.query('COMMIT')
  } finally { cl.release() }
  const swapped = await db.getCard(ORG, swap.id)
  ok('สลับ BOB → CAROL แล้วยัง doing อยู่', swapped.status_type === 'doing', swapped.status_type)
  ok('คนใหม่อยู่ในลิสต์', swapped.assignee_ids.includes(CAROL) && !swapped.assignee_ids.includes(BOB))

  // ⚠️ เช็คลิสต์ย้ายไป db/kanban/fields.js ตั้งแต่ 712a45a (กลายเป็น custom field ชนิดหนึ่ง)
  //    บล็อกเดิมที่เรียก db.addChecklistItem/setChecklistDone จาก cards.js ถูกเอาออกแล้ว —
  //    มันโยน TypeError เงียบๆ ทำให้เช็คหลังจากนั้นทั้งหมดถูกข้าม แต่ยังพิมพ์ "ผ่านหมด"
  //    ความครอบคลุมของเช็คลิสต์อยู่ที่สโมคของ fields.js แทน

  console.log('\n── กรองด้วยผู้รับผิดชอบ ──')
  await db.addAssignee(ORG, a.id, BOB)
  const { cards: mine } = await db.listCards(ORG, { assigneeUserId: BOB })
  ok('การ์ดที่ BOB รับผิดชอบขึ้นครบ', mine.some(r => String(r.id) === String(a.id)) &&
                                       mine.some(r => String(r.id) === String(b.id)))
  ok('การ์ดของคนอื่นไม่ปน', !mine.some(r => String(r.id) === String(solo.id)))
  const stats = await db.countCardStats(ORG, BOB)
  ok('countCardStats: mine ⊆ assigned', stats.mine <= stats.assigned, `${stats.mine}/${stats.assigned}`)

  console.log('\n── ปล่อยงานคืนกอง (backlog ต้องถอดผู้รับผิดชอบทุกคน) ──')
  const rel = await db.createCard(ORG, { title: 'สโมค: ปล่อยคืน', assigneeIds: [BOB, CAROL] }, ALICE)
  made.push(rel.id)
  ok('เริ่มต้นมีคนรับ 2 คน + doing', rel.assignee_ids.length === 2 && rel.status_type === 'doing')
  const back = await db.setCardStatus(ORG, rel.id, 'backlog')
  ok('ย้ายมา backlog → ผู้รับผิดชอบหลุดหมด', back.assignee_ids.length === 0, `n=${back.assignee_ids.length}`)
  const { cards: pool2 } = await db.listCards(ORG, { unassigned: true })
  ok('โผล่ในกอง "ยังไม่มีคนรับ"', pool2.some(r => String(r.id) === String(rel.id)))
  const { cards: bobAfter } = await db.listCards(ORG, { assigneeUserId: BOB })
  ok('หายจากงานของคนเดิม', !bobAfter.some(r => String(r.id) === String(rel.id)))

  console.log('\n── กันข้าม org ──')
  ok('org อื่นอ่านการ์ดนี้ไม่เห็น', (await db.getCard(8, b.id)) === null)
  ok('เก็บเข้ากรุข้าม org ไม่ได้', (await db.archiveCard(8, b.id)) === false)

  console.log('\n── เก็บเข้ากรุ (archive) ──')
  ok('เก็บเข้ากรุได้', (await db.archiveCard(ORG, b.id)) === true)
  ok('เก็บซ้ำคืน false', (await db.archiveCard(ORG, b.id)) === false)
  const { cards: bob2 } = await db.listCards(ORG, { assigneeUserId: BOB })
  ok('หายจากงานของ BOB', !bob2.some(r => String(r.id) === String(b.id)))
  ok('หายจากรายการปกติ', !(await db.listCards(ORG)).cards.some(r => r.id === b.id))

  console.log('\n── ⭐ กรุต้องเปิดดูและเอากลับมาได้ (ไม่ใช่ลบทิ้ง) ──')
  const { cards: inArchive } = await db.listCards(ORG, { onlyArchived: true })
  ok('เห็นในโหมดกรุ', inArchive.some(r => r.id === b.id))
  ok('โหมดกรุไม่ปนการ์ดปกติ', inArchive.every(r => r.archived_at !== null))
  ok('สถานะเดิมไม่ถูกแตะตอนเข้ากรุ', inArchive.find(r => r.id === b.id)?.status_type === b.status_type)
  ok('เอาออกจากกรุได้', (await db.unarchiveCard(ORG, b.id)) === true)
  ok('เอาออกซ้ำคืน false', (await db.unarchiveCard(ORG, b.id)) === false)
  ok('กลับมาอยู่ในรายการปกติ', (await db.listCards(ORG)).cards.some(r => r.id === b.id))
  ok('เอาออกจากกรุข้าม org ไม่ได้', (await db.unarchiveCard(8, b.id)) === false)

  console.log('\n── หาด้วยเลข ref ──')
  const byRef = await db.getCardByRef(ORG, a.ref_no)
  ok('K-xx หาเจอ', byRef?.id === a.id)
} catch (e) {
  // ⛔ ห้ามให้ finally กลืน error — เดิม process.exit(0) ใน finally ทับ throw ทิ้ง
  //    ผลคือสคริปต์ crash กลางทางแต่ยังพิมพ์ "✅ ผ่านหมด" + exit 0 (เจอ 2026-08-18)
  fail++
  console.error('\n💥 สโมคหยุดกลางทาง:', e.message)
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
