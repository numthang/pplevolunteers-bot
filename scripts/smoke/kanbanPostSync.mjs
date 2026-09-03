// สโมค: ตะเข็บ post_assignees ↔ การ์ด kanban (เฟส C)
//   node --import ./scripts/smoke/_envload.mjs scripts/smoke/kanbanPostSync.mjs
//
// สร้างโพสต์ปลอมด้วย SQL ตรงๆ (ไม่ผ่าน createPost จึงไม่ยิง mirror ซ้อน) แล้วลบทิ้งท้ายสุด
// สิ่งที่คุ้ม: **ทั้งสองทิศ** — เขียนที่ต้นทางแล้วสำเนาตาม · และประตู assignPost/unassignPost
// ที่ทั้งหน้า /posts และบอร์ด kanban เรียกร่วมกัน (บั๊กเดิม: กดรับงานบนบอร์ดแล้วต้นทางไม่รู้เรื่อง)
import { mirrorEntityCard, syncPostCardPeople } from '../../web/db/kanban/links.js'
import { getCard } from '../../web/db/kanban/cards.js'
import { getPost, getPostAssignees } from '../../web/db/posts/episodes.js'
import { assignPost, unassignPost, canAssignPost } from '../../web/lib/postAssign.js'
import pool from '../../web/db/index.js'

const ORG = 1, ALICE = 1, BOB = 2, CAROL = 3
let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}
// ⚠️ getCard คืน **สถานะสด** ที่คำนวณจาก post_episodes.status ไม่ใช่คอลัมน์ —
//    invariant ของ trigger อยู่ที่คอลัมน์ ต้องอ่านดิบเท่านั้น (กับดักเดียวกับสโมคฝั่งเคส)
const rawStatus = async (id) =>
  (await pool.query(`SELECT status_type FROM kanban_cards WHERE id = $1`, [id])).rows[0].status_type

let postId = null, cardId = null
try {
  const { rows } = await pool.query(
    `INSERT INTO post_episodes (org_id, created_by, visibility, status, title, created_via)
     VALUES ($1, $2, 'org', 'draft', 'สโมค: งานสื่อเฟส C', 'manual') RETURNING id`, [ORG, ALICE])
  postId = Number(rows[0].id)
  const post = await getPost(postId)
  console.log(`\n── โพสต์ทดสอบ id=${postId} (คนสร้าง=${ALICE}) ──`)

  cardId = await mirrorEntityCard(ORG, 'post', { id: postId, title: post.title, assigneeIds: [] }, ALICE)
  ok('mirror สร้างการ์ดให้โพสต์ได้', Boolean(cardId), `card=${cardId}`)
  let card = await getCard(ORG, cardId)
  ok('⛔ คนสร้างไม่ถูกยัดเป็นผู้รับผิดชอบ (บั๊กที่เฟส C มาแก้)', card.assignee_ids.length === 0)
  ok('ยังไม่มีคนรับ → การ์ด backlog', (await rawStatus(cardId)) === 'backlog')

  console.log('\n── ต้นทาง → สำเนา: assignPost ──')
  await assignPost(ORG, post, BOB, { actorUserId: ALICE })
  await assignPost(ORG, post, CAROL, { actorUserId: ALICE })
  ok('post_assignees มี 2 คน', (await getPostAssignees(postId, ORG)).length === 2)
  card = await getCard(ORG, cardId)
  ok('สำเนาลงการ์ดครบ 2 คน', card.assignee_ids.length === 2, card.assignee_ids.join(','))
  ok('มีคนรับแล้ว → การ์ด **ยังอยู่ backlog** (⛔ ถอด bumpsBacklog 2026-09-03)',
     (await rawStatus(cardId)) === 'backlog', await rawStatus(cardId))

  console.log('\n── สลับชุดคนทั้งชุด (DELETE ก่อน INSERT ในทรานแซกชันเดียว) ──')
  // ลากไป "กำลังทำ" ด้วยมือก่อน — เพื่อพิสูจน์ว่า sync รายชื่อ **ไม่แตะกอง** ไม่ว่าคนจะเปลี่ยนยังไง
  await pool.query(`UPDATE kanban_cards SET status_type = 'doing' WHERE id = $1`, [cardId])
  await pool.query(`DELETE FROM post_assignees WHERE episode_id = $1`, [postId])
  await pool.query(
    `INSERT INTO post_assignees (org_id, episode_id, user_id) VALUES ($1, $2, $3)`, [ORG, postId, ALICE])
  await syncPostCardPeople(postId)
  card = await getCard(ORG, cardId)
  const raw = await rawStatus(cardId)
  ok('คอลัมน์สถานะไม่ขยับตอนสลับชุดคน', raw === 'doing', `คอลัมน์=${raw}`)
  ok('เหลือคนใหม่คนเดียว', card.assignee_ids.length === 1 && card.assignee_ids[0] === ALICE)

  console.log('\n── ถอดคนสุดท้าย → การ์ด **อยู่กองเดิม** (⛔ ถอด trigger clamp 2026-09-03) ──')
  await unassignPost(ORG, post, ALICE, { actorUserId: ALICE })
  card = await getCard(ORG, cardId)
  ok('ไม่เหลือใครทั้งต้นทางและสำเนา',
    card.assignee_ids.length === 0 && (await getPostAssignees(postId, ORG)).length === 0)
  const raw2 = await rawStatus(cardId)
  ok('ไม่มีใครรับแล้วแต่การ์ดยังอยู่กองเดิม (ไม่มี clamp)', raw2 === 'doing', raw2)

  console.log('\n── ร่างส่วนตัวไม่มีผู้รับผิดชอบ ──')
  await pool.query(`UPDATE post_episodes SET visibility = 'personal' WHERE id = $1`, [postId])
  ok('canAssignPost ปฏิเสธร่างส่วนตัว', canAssignPost(await getPost(postId)) === false)
  ok('canAssignPost ยอมรับโพสต์องค์กร', canAssignPost({ visibility: 'org' }) === true)
} catch (e) {
  fail++
  console.error('\n💥 หยุดกลางทาง:', e.message)
} finally {
  if (cardId) await pool.query(`DELETE FROM kanban_cards WHERE id = $1`, [cardId])
  if (postId) await pool.query(`DELETE FROM post_episodes WHERE id = $1`, [postId])
  console.log('\n🧹 ลบโพสต์+การ์ดทดสอบแล้ว')
  await pool.end()
  console.log(fail ? `\n❌ ไม่ผ่าน ${fail} ข้อ` : `\n✅ ผ่านหมด`)
  process.exit(fail ? 1 : 0)
}
