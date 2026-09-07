// สโมค: บทพูด (posts.script) — ทั้ง prompt และที่เก็บ bodies.script
//   node --import ./scripts/smoke/_envload.mjs scripts/smoke/postsScript.mjs
//   node --import ./scripts/smoke/_envload.mjs scripts/smoke/postsScript.mjs --no-ai   (ข้ามการยิง AI)
//
// ทำไมต้องมี: หน้าอ่านบทพูด (/posts/[id]/script) พึ่งของ 2 อย่างที่พังเงียบได้ทั้งคู่
//   1. slot posts.script ต้องคืน JSON ที่มีคีย์ script และ **ห้ามเติมข้อเท็จจริงใหม่**
//      → ปรับ head ใน config/aiPrompts.js เมื่อไหร่ ให้รันตัวนี้ดูผลก่อนเชื่อ
//   2. bodies เป็น jsonb ก้อนเดียว — เขียนทับทั้งก้อน = คีย์อื่นหายเงียบๆ ไม่มี error ให้เห็น
import { createRequire } from 'node:module'
import { askAiJson } from '../../web/lib/ai.js'
import { updatePostContent, getPost } from '../../web/db/posts/episodes.js'
import pool from '../../web/db/index.js'

const require = createRequire(import.meta.url)
const { defaultPrompt } = require('../../config/aiPrompts.js')

const SKIP_AI = process.argv.includes('--no-ai')
const ORG = 1, ALICE = 1

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

// ── 1. slot ประกอบได้ และมีคำสั่งกันแต่งเรื่องอยู่จริง ─────────────
console.log('\n1) slot posts.script')
const system = defaultPrompt('posts.script')
ok('ประกอบ prompt ได้', !!system)
ok('มีกฎห้ามเติมข้อเท็จจริง', /ห้ามเพิ่มข้อเท็จจริง/.test(system || ''))
ok('ประกาศรูปแบบ JSON ที่ route ไป parse', /"script"/.test(system || ''))

// ── 2. ยิง AI จริงด้วยเนื้อหาที่มีตัวเลข/วงเล็บครบ ─────────────────
// ต้นฉบับคุมเอง (ไม่ดึงจาก DB) เพื่อให้ "ข้อเท็จจริงที่อนุญาต" เป็นชุดตายตัว เทียบผลได้ทุกครั้ง
const SOURCE = `สรุปงานประจำสัปดาห์ของทีมอาสา

สัปดาห์นี้เรารับเรื่องร้องเรียนเข้ามา 12 เรื่อง ปิดจบไปได้ 9 เรื่อง (คิดเป็น 75%)
เรื่องที่ยังค้างส่วนใหญ่เป็นปัญหาน้ำประปาไม่ไหลในเขตเทศบาล
- ผู้ที่แจ้งเรื่องไว้สามารถติดตามสถานะได้ที่เพจ
- ทีมลงพื้นที่ทุกวันเสาร์`

console.log('\n2) แปลงเป็นบทพูด' + (SKIP_AI ? ' (ข้าม --no-ai)' : ''))
if (!SKIP_AI) {
  const out = await askAiJson(system, ['ชื่อโพสต์: สรุปงานสัปดาห์', 'หมวด: รายงาน', '', 'ต้นฉบับ:', SOURCE].join('\n'), { orgId: ORG })
  const s = typeof out.script === 'string' ? out.script.trim() : ''
  ok('ได้คีย์ script กลับมา', !!s)

  // รูปแบบที่ปากอ่านออกเสียงไม่ได้ — ทั้งหมดนี้สั่งห้ามไว้ใน head
  ok('ไม่มีวงเล็บ', !/[()（）]/.test(s))
  ok('ไม่มีบุลเล็ต', !/^\s*[-•*]\s/m.test(s))
  ok('ไม่มี markdown/hashtag', !/[#*_]/.test(s))
  ok('ไม่มีอีโมจิ', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s))
  ok('ตัวเลขเขียนเป็นคำอ่าน', !/\d/.test(s), /\d/.test(s) ? `เจอ "${s.match(/\d+/)?.[0]}"` : '')
  ok('มีย่อหน้าให้หายใจ', s.split(/\n\s*\n/).length >= 2)
  // เคยพลาดจริง 2026-09-08: ต้นฉบับไม่มีช่อง [ใส่ตรงนี้ — …] เลย แต่ AI สร้างขึ้นมาเอง
  ok('ไม่สร้างช่อง [ใส่ตรงนี้] ที่ต้นฉบับไม่มี', !/\[ใส่ตรงนี้/.test(s))
  // วลีเสริมที่ฟังดูดีแต่ต้นฉบับไม่ได้พูด — ตัวอย่างจริงที่หลุดมารอบแรกคือ "กำลังเร่งดำเนินการต่อเนื่อง"
  const filler = ['เร่งดำเนินการ', 'อย่างต่อเนื่อง', 'เพื่อประโยชน์ของพี่น้อง'].filter(w => s.includes(w))
  ok('ไม่เติมวลีเสริมที่ต้นฉบับไม่ได้พูด', filler.length === 0, filler.join(' · '))
  ok('ความยาวพอดีคลิปสั้น', s.length >= 150 && s.length <= 1600, `${s.length} ตัวอักษร`)

  console.log('\n  ── บทที่ได้ ──')
  console.log(s.split('\n').map(l => '  │ ' + l).join('\n'))
  console.log('\n  ⚠️  ข้อที่เครื่องตรวจแทนคนไม่ได้: ต้องอ่านเทียบเองว่า**ไม่มีข้อเท็จจริงใหม่**')
  console.log('     ที่อนุญาตมีแค่: 12 เรื่อง · 9 เรื่อง · 75% · น้ำประปา · เขตเทศบาล · เพจ · วันเสาร์')
}

// ── 3. bodies.script ต้องไม่ทับคีย์อื่นใน jsonb ─────────────────────
console.log('\n3) ที่เก็บ bodies.script')
const { rows: [tmp] } = await pool.query(
  `INSERT INTO post_episodes (org_id, created_by, visibility, title, body, bodies, last_edited_by)
   VALUES ($1, $2, 'personal', 'สโมคบทพูด', 'เนื้อหาทดสอบ', '{"keepme":"ห้ามหาย"}'::jsonb, $2)
   RETURNING id`,
  [ORG, ALICE]
)
try {
  const before = await getPost(tmp.id)
  const res = await updatePostContent(
    tmp.id,
    { bodies: { ...(before.bodies || {}), script: 'บรรทัดแรก\n\nบรรทัดสอง' } },
    { lockToken: before.lock_token, editorUserId: ALICE, editorName: 'สโมค' }
  )
  ok('เขียนผ่าน (lockToken ถูก)', res.ok === true)
  const after = await getPost(tmp.id)
  ok('bodies.script ลงจริง', after.bodies?.script === 'บรรทัดแรก\n\nบรรทัดสอง')
  ok('คีย์เดิมใน bodies ไม่หาย', after.bodies?.keepme === 'ห้ามหาย')
  ok('body ของโพสต์ไม่ถูกแตะ', after.body === 'เนื้อหาทดสอบ')

  // lockToken เก่าต้องใช้ไม่ได้แล้ว — ถ้าด่านนี้หลุด = autosave ของ 2 แท็บทับกันเงียบๆ (bug-071)
  const stale = await updatePostContent(
    tmp.id,
    { bodies: { script: 'ทับด้วย token เก่า' } },
    { lockToken: before.lock_token, editorUserId: ALICE, editorName: 'สโมค' }
  )
  ok('lockToken เก่าถูกปฏิเสธ', stale.ok === false && stale.conflict === true)
  const final = await getPost(tmp.id)
  ok('ของเดิมไม่ถูกทับ', final.bodies?.script === 'บรรทัดแรก\n\nบรรทัดสอง')
} finally {
  await pool.query('DELETE FROM post_episodes WHERE id = $1', [tmp.id])
}

console.log(fail ? `\n❌ ตก ${fail} ข้อ` : '\n✅ ผ่านทั้งหมด')
await pool.end()
process.exit(fail ? 1 : 0)
