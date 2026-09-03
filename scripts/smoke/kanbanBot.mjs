// smoke test ฝั่งบอทของ kanban ก้อน 2 — รันกับฐานจริง แล้วลบของที่สร้างทิ้งท้ายสุด
//   node --env-file=.env scripts/smoke/kanbanBot.mjs
//
// ทดสอบเฉพาะชั้นที่ไม่ต้องเปิด Discord: แปลง guild→org · discord→user · จองเลข · กติกาเจ้าภาพ
// ⚠️ ตัว flow modal/context menu ต้องกดจริงในดิสฯ เท่านั้น ไม่มีทางเทสอัตโนมัติ
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

const { createCardFromDiscord } = require('../../db/kanbanCards.js')
const pool = require('../../db/index.js')

const GUILD = '1340903354037178410'   // อาสาประชาชน → org 1
const DISCORD = '1094566123443339344'

const made = []
let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

// สำเนา parseDue จาก handler — logic เดียวกัน เทสแยกได้เพราะเป็นฟังก์ชันบริสุทธิ์
function parseDue(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/)
  if (!m) return undefined
  const [, y, mo, d, hh, mm] = m
  return `${y}-${mo}-${d} ${hh || '00'}:${mm || '00'}:00`
}

try {
  console.log('\n── แปลงวันที่ที่คนพิมพ์ในดิสฯ ──')
  ok('วันอย่างเดียว → เที่ยงคืน', parseDue('2026-08-20') === '2026-08-20 00:00:00')
  ok('วัน+เวลา',                  parseDue('2026-08-20 17:00') === '2026-08-20 17:00:00')
  ok('รับ T คั่นด้วย',            parseDue('2026-08-20T17:00') === '2026-08-20 17:00:00')
  ok('เว้นว่าง → null',           parseDue('') === null)
  ok('มั่ว → undefined (บอกผู้ใช้)', parseDue('พรุ่งนี้') === undefined)
  ok('รูปแบบไทยไม่รับ',            parseDue('20/08/2026') === undefined)

  console.log('\n── สร้างการบ้านจากข้อความ ──')
  const a = await createCardFromDiscord({
    guildId: GUILD, actorDiscordId: DISCORD,
    title: 'สโมคบอท: รับเอง', detail: 'จากข้อความในห้อง', dueAt: parseDue('2026-08-20 17:00'),
  })
  made.push(a.id)
  ok('สร้างได้ + ได้เลข ref', a.ref_no > 0, `K-${a.ref_no}`)
  ok('รับเอง → doing', a.status_type === 'doing', a.status_type)
  const { rows: mine } = await pool.query(
    `SELECT user_id FROM kanban_card_assignees WHERE card_id = $1`, [a.id])
  ok('รับเอง → มีแถวผู้รับผิดชอบ 1 คน', mine.length === 1, `n=${mine.length}`)

  const b = await createCardFromDiscord({
    guildId: GUILD, actorDiscordId: DISCORD, title: 'สโมคบอท: โยนเข้ากอง', assignToSelf: false,
  })
  made.push(b.id)
  const { rows: none } = await pool.query(
    `SELECT user_id FROM kanban_card_assignees WHERE card_id = $1`, [b.id])
  ok('ไม่รับเอง → ไม่มีคนรับ + backlog', none.length === 0 && b.status_type === 'backlog', b.status_type)
  ok('เลข ref เดินหน้าไม่ซ้ำ', b.ref_no === a.ref_no + 1, `${a.ref_no} → ${b.ref_no}`)

  console.log('\n── ตะเข็บบอท ↔ เว็บ ต้องเห็นของกันและกัน ──')
  const { rows } = await pool.query(
    `SELECT c.org_id, c.due_at, u.discord_id
       FROM kanban_cards c
       JOIN kanban_card_assignees k ON k.card_id = c.id
       JOIN users u ON u.id = k.user_id
      WHERE c.id = $1`, [a.id])
  ok('org มาจาก guild ถูก', rows[0].org_id === 1, `org=${rows[0].org_id}`)
  ok('ผู้รับผิดชอบผูกกลับไปหา discord คนกดได้', rows[0].discord_id === DISCORD)
  const local = new Date(rows[0].due_at).toLocaleString('sv-SE', { timeZone: 'Asia/Bangkok' })
  ok('17:00 ที่พิมพ์ = 17:00 ในไทย', local.includes('17:00'), `เก็บได้ ${local}`)

  console.log('\n── guild ที่ไม่ผูก org ต้องไม่เงียบ ──')
  let threw = false
  try {
    await createCardFromDiscord({ guildId: '000000000000000000', actorDiscordId: DISCORD, title: 'ควรพัง' })
  } catch { threw = true }
  ok('โยน error ไม่ใช่สร้างการ์ดกำพร้า', threw)
} finally {
  if (made.length) {
    await pool.query(`DELETE FROM kanban_cards WHERE id = ANY($1)`, [made])
    console.log(`\n🧹 ลบการ์ดทดสอบ ${made.length} ใบ`)
  }
  await pool.end()
  console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : `\n✅ ผ่านหมด`)
  process.exit(fail ? 1 : 0)
}
