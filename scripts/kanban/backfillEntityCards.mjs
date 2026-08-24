// กวาดให้ "ของจริงทุกชิ้นมีการ์ดใน kanban" — เคส + งานสื่อ (user เคาะ 2026-08-24: ต้องมี ทุกใบ)
//
//   node --env-file=.env scripts/kanban/backfillEntityCards.mjs --org 1 [--type case|post] [--dry]
//
// PRODUCTION:
//   sudo -u www bash -c 'cd /www/wwwroot/pple-volunteers && \
//     node --env-file=.env scripts/kanban/backfillEntityCards.mjs --org 1'
//
// ⭐ รันซ้ำได้ปลอดภัย — ของที่มีการ์ดแล้วถูกข้าม (UNIQUE (entity_type, entity_id) กันอีกชั้น)
//    จึงใช้เป็น "ตัวตามเก็บ" ประจำได้ ไม่ใช่แค่ครั้งเดียวตอน migrate
//
// ⭐ โพสต์กวาด **ทุกใบที่ยังไม่เข้ากรุ รวม `visibility='personal'`** (user กลับคำ 2026-08-24 รอบสอง)
//    ร่างส่วนตัวขึ้นบอร์ดของเจ้าของคนเดียว — คนอื่นไม่เห็น (visibleLinkSql กันไว้ตอนอ่าน)
//    ⚠️ ตัวเลขที่นับข้างล่างต้องใช้เงื่อนไขเดียวกับ SOURCE_SQL.post ใน web/db/kanban/links.js เป๊ะ
//       ไม่งั้นสคริปต์บอก "จะสร้าง N ใบ" แล้วสร้างจริงคนละจำนวน
import { reconcileEntityCards } from '../../web/db/kanban/links.js'
import pool from '../../web/db/index.js'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const has = (name) => process.argv.includes(`--${name}`)

const orgId = Number(arg('org', 1))
const type = arg('type', null)
const dry = has('dry')

if (type && !['case', 'post'].includes(type)) {
  console.error('--type รับได้แค่ case หรือ post')
  process.exit(1)
}

const LABEL = { case: 'เรื่องร้องเรียน', post: 'งานสื่อ' }

async function main() {
  const { rows: org } = await pool.query('SELECT name FROM orgs WHERE id = $1', [orgId])
  if (!org[0]) { console.error(`ไม่พบ org ${orgId}`); process.exit(1) }
  console.log(`องค์กร: ${org[0].name} (id ${orgId})${dry ? '  [DRY RUN — ไม่เขียนอะไรเลย]' : ''}`)

  // นับก่อนเสมอ — คนรันต้องรู้ว่ากำลังจะสร้างการ์ดกี่ใบ ก่อนที่มันจะเริ่มสร้าง
  const { rows: pre } = await pool.query(
    `SELECT
       (SELECT count(*) FROM cases c
         WHERE c.org_id = $1
           AND NOT EXISTS (SELECT 1 FROM kanban_card_links l
                            WHERE l.entity_type = 'case' AND l.entity_id = c.id))::int AS cases,
       (SELECT count(*) FROM post_episodes p
         WHERE p.org_id = $1 AND p.archived_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM kanban_card_links l
                            WHERE l.entity_type = 'post' AND l.entity_id = p.id))::int AS posts,
       (SELECT count(*) FROM kanban_cards k WHERE k.org_id = $1)::int AS cards,
       (SELECT COALESCE(MAX(ref_no), 0) FROM kanban_cards k WHERE k.org_id = $1)::int AS max_ref`,
    [orgId]
  )
  const p = pre[0]
  const todo = (type === 'post' ? 0 : p.cases) + (type === 'case' ? 0 : p.posts)

  console.log(`ยังไม่มีการ์ด: เรื่องร้องเรียน ${p.cases} · งานสื่อ ${p.posts}  → รวม ${todo} ใบ`)
  console.log(`การ์ดตอนนี้ ${p.cards} ใบ (เลขล่าสุด K-${p.max_ref}) → หลังกวาดจะถึง K-${p.max_ref + todo}`)

  if (!todo) { console.log('ไม่มีอะไรต้องกวาด'); return }
  if (dry) { console.log('DRY RUN — จบ ไม่ได้เขียนอะไร'); return }

  // ผู้สร้างการ์ดสำรอง — เคสจากฟอร์มสาธารณะไม่มี created_by (ผู้ร้องไม่ได้ล็อกอิน)
  const { rows: owner } = await pool.query(
    `SELECT created_by FROM kanban_boards WHERE org_id = $1 ORDER BY sort_order, id LIMIT 1`, [orgId]
  )
  if (!owner[0]) { console.error('org นี้ยังไม่มีกระดานสักใบ — เปิดหน้า /kanban ครั้งแรกก่อน'); process.exit(1) }

  const t0 = Date.now()
  const stats = await reconcileEntityCards(orgId, {
    entityType: type,
    createdBy: owner[0].created_by,
    onProgress: (e) => {
      if (e.phase === 'start' && e.total) console.log(`\n${LABEL[e.type]}: ${e.total} ใบ`)
      // \r ทับบรรทัดเดิม — ไม่พ่นบรรทัดใหม่ทุกแถว (CLAUDE.md §Import / Sync Scripts)
      if (e.phase === 'tick' && (e.done % 10 === 0 || e.done === e.total)) {
        process.stdout.write(`\r  ${e.done}/${e.total} (พลาด ${e.stats.failed})`)
      }
      if (e.phase === 'end') process.stdout.write('\n')
    },
  })

  console.log(`\nเสร็จ: สร้าง ${stats.created} ใบ · พลาด ${stats.failed} ใบ · ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(1)} วิ`)
  if (stats.failed) console.log('⚠️ ที่พลาดยังไม่มีการ์ด — รันซ้ำได้เลย ของที่สำเร็จแล้วจะถูกข้าม')
}

main()
  .catch((e) => { console.error('พัง:', e.message); process.exitCode = 1 })
  .finally(() => pool.end())
