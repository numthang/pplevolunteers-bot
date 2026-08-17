// smoke test ชั้น DB ของ "คลังป้าย" kanban — รันกับฐานจริง แล้วลบของที่สร้างทิ้งท้ายสุด
//
// เน้น 3 กับดักที่ /scrutinize จับได้ (2026-08-17) เพราะเป็นความเสียหายที่มองไม่เห็นตอนกดใช้:
//   1. เปลี่ยนชื่อ/ย้ายกลุ่ม แล้วสีชิปต้องไม่เด้ง (updateLabel ต้องแช่สีอัตโนมัติลง DB ก่อน)
//   2. ป้ายที่ซ่อนแล้วต้องไม่หลุดออกจากการ์ดตอนมีคนแก้ป้ายบนการ์ดใบนั้น
//   3. จำนวนการ์ดต้องไม่นับการ์ดที่ถูกลบไปแล้ว
import * as labels from '../../web/db/kanban/labels.js'
import * as cards from '../../web/db/kanban/cards.js'
import pool from '../../web/db/index.js'
import { autoColor, chipProps } from '../../web/lib/kanbanLabelColors.js'

const ORG = 1, ALICE = 1
const GROUP = 'สโมคกลุ่ม'
const madeLabels = []
const madeCards = []
let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

try {
  console.log('\n── สร้างป้าย (ensureLabel) ──')
  const a = await labels.ensureLabel(ORG, { name: 'สโมค-ก', groupName: GROUP })
  madeLabels.push(a.id)
  ok('สร้างป้ายใหม่ได้', Boolean(a?.id), `id=${a.id}`)
  ok('ป้ายใหม่ color เป็น NULL (ปล่อยให้ hash เลือกสี)', a.color === null, String(a.color))

  const again = await labels.ensureLabel(ORG, { name: 'สโมค-ก', groupName: GROUP })
  ok('ชื่อซ้ำในกลุ่มเดิม → ได้ป้ายเดิม ไม่สร้างซ้ำ', String(again.id) === String(a.id))

  const other = await labels.ensureLabel(ORG, { name: 'สโมค-ก', groupName: null })
  madeLabels.push(other.id)
  ok('ชื่อเดียวกันแต่คนละกลุ่ม → คนละป้าย', String(other.id) !== String(a.id))

  ok('ชื่อว่าง → null ไม่สร้างแถวขยะ', (await labels.ensureLabel(ORG, { name: '   ' })) === null)

  console.log('\n── กลุ่มที่มีอยู่จริง ──')
  const groupNames = await labels.listGroupNames(ORG)
  ok('listGroupNames เห็นกลุ่มที่เพิ่งสร้าง', groupNames.includes(GROUP), groupNames.join(' · '))

  console.log('\n── ⭐ เปลี่ยนชื่อแล้วสีต้องไม่เด้ง ──')
  const colorBefore = chipProps(a).style['--kb']
  const renamed = await labels.updateLabel(ORG, a.id, { name: 'สโมค-ก2' })
  ok('เปลี่ยนชื่อสำเร็จ', renamed.ok && renamed.label.name === 'สโมค-ก2')
  ok('สีถูกแช่ลง DB ตอนเปลี่ยนชื่อ', renamed.label.color === colorBefore, `${colorBefore} → ${renamed.label.color}`)
  ok('สีที่แสดงเท่าเดิมเป๊ะ', chipProps(renamed.label).style['--kb'] === colorBefore)
  ok('ถ้าไม่แช่ สีจะเป็นคนละอัน (พิสูจน์ว่าเทสนี้มีความหมาย)',
    autoColor({ name: 'สโมค-ก2', group: GROUP }) !== colorBefore,
    `hash ใหม่ = ${autoColor({ name: 'สโมค-ก2', group: GROUP })}`)

  console.log('\n── ชื่อชนกัน + ตั้งสีเอง ──')
  const dup = await labels.ensureLabel(ORG, { name: 'สโมค-ข', groupName: GROUP })
  madeLabels.push(dup.id)
  const clash = await labels.updateLabel(ORG, dup.id, { name: 'สโมค-ก2' })
  ok('เปลี่ยนชื่อไปชนของเดิม → duplicate ไม่ใช่ throw', clash.ok === false && clash.duplicate === true)
  const painted = await labels.updateLabel(ORG, dup.id, { color: '#F14668' })
  ok('ตั้งสีเองได้', painted.ok && painted.label.color === '#F14668')
  const cleared = await labels.updateLabel(ORG, dup.id, { color: null })
  ok('ล้างสีกลับไปใช้อัตโนมัติได้', cleared.ok && cleared.label.color === null)
  ok('ไม่พบป้าย → notFound', (await labels.updateLabel(ORG, 999999999, { name: 'x' })).notFound === true)

  console.log('\n── ⭐ ซ่อนป้ายแล้วต้องไม่หลุดจากการ์ด ──')
  const card = await cards.createCard(ORG, { title: 'สโมค: การ์ดทดสอบป้าย' }, ALICE)
  madeCards.push(card.id)
  await labels.setCardLabels(ORG, card.id, [a.id, dup.id])
  ok('ติดป้าย 2 อันได้', (await cards.getCard(ORG, card.id)).labels.length === 2)

  await labels.archiveLabel(ORG, a.id)
  const afterHide = await cards.getCard(ORG, card.id)
  ok('ป้ายที่ซ่อนไม่โผล่บนการ์ด', afterHide.labels.length === 1 && String(afterHide.labels[0].id) === String(dup.id))

  // จำลองสิ่งที่เกิดจริง: คนเปิดการ์ดแล้วแก้ป้าย → client ส่งมาเฉพาะ id ที่มองเห็น
  await labels.setCardLabels(ORG, card.id, [dup.id])
  await labels.unarchiveLabel(ORG, a.id)
  const afterUnhide = await cards.getCard(ORG, card.id)
  ok('เลิกซ่อนแล้วป้ายกลับมาติดการ์ดเหมือนเดิม', afterUnhide.labels.length === 2,
    afterUnhide.labels.map(l => l.name).join(' · '))

  console.log('\n── นับจำนวนการ์ด ──')
  ok('countCardsWithLabel นับการ์ดที่ติดอยู่', (await labels.countCardsWithLabel(ORG, dup.id)) >= 1)
  const withCounts = await labels.listLabelsWithCounts(ORG)
  const rowDup = withCounts.find(l => String(l.id) === String(dup.id))
  ok('listLabelsWithCounts คืน card_count', rowDup?.card_count >= 1, `card_count=${rowDup?.card_count}`)
  ok('listLabelsWithCounts รวมป้ายที่ซ่อนไว้ด้วย', withCounts.length >= (await labels.listLabels(ORG)).length)

  const before = (await labels.countCardsWithLabel(ORG, dup.id))
  await cards.archiveCard(ORG, card.id)
  ok('ลบการ์ดแล้ว count ต้องลดลง (ไม่นับการ์ดที่ลบไปแล้ว)',
    (await labels.countCardsWithLabel(ORG, dup.id)) === before - 1)
} catch (e) {
  fail++
  console.error('\n❌ ระเบิดกลางทาง:', e.message)
} finally {
  for (const id of madeCards) await pool.query('DELETE FROM kanban_cards WHERE id = $1', [id])
  for (const id of madeLabels) await pool.query('DELETE FROM kanban_labels WHERE id = $1', [id])
  console.log(fail ? `\n❌ ตก ${fail} ข้อ` : '\n✅ ผ่านหมด')
  await pool.end()
  process.exit(fail ? 1 : 0)
}
