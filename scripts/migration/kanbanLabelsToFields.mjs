// scripts/migration/kanbanLabelsToFields.mjs — ยุบ "ป้าย" เข้า custom field
//
//   node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs             → DRY-RUN (ไม่เขียน DB)
//   node --env-file=.env scripts/migration/kanbanLabelsToFields.mjs --commit    → เขียนจริง
//   ... --org 1                                                                 → เจาะ org เดียว (ปกติทำทุก org ที่มีป้าย)
//
// ทำไม: ป้ายกับ custom field เก็บของความหมายเดียวกัน 2 ที่ — ก่อน import การ์ดเก่าอีก 82 ใบ
// ต้องเหลือที่เก็บเดียว ไม่งั้นข้อมูลใหม่จะแตกไปคนละทาง (user เคาะ 2026-08-19)
//
// ⛔ **ห้ามอ้าง field id หรือ key ตรงๆ** — id ที่เห็นบนเครื่อง dev (#47 พื้นที่ / #31 สายงาน / #48 อุปกรณ์)
//    เกิดจาก user กดสร้างเองผ่าน UI บน dev เท่านั้น · prod ไม่มี และ key ก็คือ `field_<id>` = คนละตัวแน่นอน
//    สคริปต์นี้จึง **resolve field จากชื่อ (org_id + label) และสร้างให้เองถ้าไม่มี**
//
// ⛔ **ไม่ DROP ตารางป้าย** — ย้ายข้อมูลอย่างเดียว `kanban_labels`/`kanban_card_labels` ยังอยู่ครบ
//    ให้ deploy แล้วดูจน prod นิ่งก่อน ค่อย DROP รอบถัดไป (แนวเดียวกับตอนยุบตะกร้าสื่อ ก้อน 4c)
//
// ⭐ รันซ้ำได้ (idempotent):
//    - option จับคู่ด้วยชื่อ (มี unique index `uq_kanban_field_options_name` บน field_id+name)
//    - multi_select เขียน value_options แบบ **union** กับของเดิม ไม่ทับทิ้ง
//    - checklist เป็น "แถวจริง" → กันซ้ำด้วย NOT EXISTS ไม่งั้นรัน 2 รอบได้ subtask งอก
//
// ⭐ สีของป้ายถูกก็อปไปที่ option ด้วย — ป้ายหาสีจาก hash ของ `กลุ่ม/ชื่อ` แต่ option หาจาก `field:<id>`
//    ปล่อยให้ autoColor คิดเอง = ชื่อเดิมแต่สีเปลี่ยนทั้งกระดาน (user เคาะไว้ว่าชื่อคือ primary key เชิงสายตา)

const pool = (await import('../../web/db/index.js')).default
// ⭐ ทางเขียนอยู่ที่ web/db/kanban/tags.js จุดเดียว — สคริปต์นี้กับสคริปต์ import ใช้ตัวเดียวกัน
//    เขียน SQL ซ้ำที่นี่เมื่อไหร่ = 2 ทางเขียนที่ดริฟต์ออกจากกัน
const tagDB = await import('../../web/db/kanban/tags.js')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }

const COMMIT = has('--commit')
const ONLY_ORG = val('--org', null)

// กลุ่มที่ไม่มีชื่อ (group_name IS NULL) ต้องมีบ้านให้ไป ไม่งั้นป้ายหายเงียบ
const UNGROUPED_FIELD = 'ป้าย'

const log = (...a) => console.log(...a)
const warn = (...a) => console.log('  ⚠️ ', ...a)

/** ชนิด field ที่รับป้ายได้ — อย่างอื่น (text/number/date/checkbox/url) ยัดป้ายลงไปไม่ได้ */
const OPTION_TYPES = ['select', 'multi_select']
const ACCEPTS = [...OPTION_TYPES, 'checklist']

async function main() {
  const { rows: orgs } = await pool.query(
    ONLY_ORG
      ? 'SELECT DISTINCT org_id FROM kanban_labels WHERE org_id = $1'
      : 'SELECT DISTINCT org_id FROM kanban_labels ORDER BY 1',
    ONLY_ORG ? [Number(ONLY_ORG)] : []
  )
  if (!orgs.length) { log('ไม่มีป้ายในระบบ — ไม่ต้องทำอะไร'); return }

  log(COMMIT ? '⚡ COMMIT MODE — เขียน DB จริง\n' : '🔍 DRY-RUN — ไม่เขียนอะไรทั้งนั้น (ใส่ --commit เพื่อเขียนจริง)\n')

  const totals = { fieldsMade: 0, optionsMade: 0, optionsReused: 0, values: 0, items: 0, skipped: 0 }

  for (const { org_id: orgId } of orgs) {
    log(`━━ org ${orgId} ━━`)

    // ป้ายทั้งหมดรวมที่ซ่อนไว้ — ซ่อนแล้วก็ต้องตามไปเป็น option ที่ซ่อน ไม่ใช่หายไปเฉยๆ
    const { rows: labels } = await pool.query(
      `SELECT id, group_name, name, color, sort_order, archived_at
         FROM kanban_labels WHERE org_id = $1 ORDER BY group_name NULLS FIRST, sort_order, id`,
      [orgId]
    )
    if (!labels.length) { log('  ไม่มีป้าย ข้าม\n'); continue }

    const groups = new Map()
    for (const l of labels) {
      const g = l.group_name?.trim() || UNGROUPED_FIELD
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g).push(l)
    }
    log(`  ป้าย ${labels.length} อัน · ${groups.size} กลุ่ม: ${[...groups.keys()].join(' · ')}`)

    for (const [groupName, groupLabels] of groups) {
      if (!labels.some((l) => (l.group_name?.trim() || '') === '') && groupName === UNGROUPED_FIELD) { /* noop */ }
      const field = await resolveField(orgId, groupName, totals)
      if (!ACCEPTS.includes(field.type)) {
        warn(`กลุ่ม "${groupName}" → field ชนิด ${field.type} รับป้ายไม่ได้ — ข้ามทั้งกลุ่ม (${groupLabels.length} ป้าย)`)
        totals.skipped += groupLabels.length
        continue
      }
      log(`  • ${groupName} → field #${field.id} (${field.type})${field.made ? ' [สร้างใหม่]' : ''} · ${groupLabels.length} ป้าย`)

      const optionOf = new Map()   // label_id → option_id
      for (const l of groupLabels) {
        const opt = await ensureOption(field, l, totals)
        if (opt) optionOf.set(String(l.id), opt)
      }

      await moveLinks(orgId, field, optionOf, totals)
    }
    log('')
  }

  log('━━ สรุป ━━')
  log(`  field สร้างใหม่   ${totals.fieldsMade}`)
  log(`  option สร้างใหม่  ${totals.optionsMade}   (ใช้ของเดิมซ้ำ ${totals.optionsReused})`)
  log(`  ค่าที่เขียน (multi_select)  ${totals.values} การ์ด`)
  log(`  งานย่อยที่เพิ่ม (checklist) ${totals.items} รายการ`)
  if (totals.skipped) log(`  ⚠️  ข้าม ${totals.skipped} ป้าย (ชนิด field รับไม่ได้)`)
  if (!COMMIT) log('\n(dry-run — ยังไม่ได้เขียนอะไร)')
}

/** หา field จาก **ชื่อ** ไม่ใช่ id — ไม่มีก็สร้าง multi_select ให้ (ป้ายเลือกได้หลายอันโดยธรรมชาติ) */
async function resolveField(orgId, name, totals) {
  const { rows } = await pool.query(
    `SELECT id, key, label, type FROM kanban_field_defs
      WHERE org_id = $1 AND label = $2 AND archived_at IS NULL
      ORDER BY id LIMIT 1`,
    [orgId, name]
  )
  if (rows[0]) return { ...rows[0], made: false }

  totals.fieldsMade++
  if (!COMMIT) return { id: `NEW(${name})`, label: name, type: 'multi_select', made: true }
  return { ...(await tagDB.ensureTagField(orgId, name)), made: true }
}

/** ป้าย 1 อัน → option 1 อัน · จับคู่ด้วยชื่อ (trim) · **ก็อปสีป้ายไปด้วย** */
async function ensureOption(field, label, totals) {
  const name = label.name.trim()
  if (!COMMIT) {
    // ⚠️ ห้ามเช็คด้วย typeof field.id === 'string' — pg คืน BIGINT มาเป็น "47" (สตริง) ทุกตัว
    //    เช็คแบบนั้น = นับ field ที่มีอยู่แล้วเป็นของใหม่ แล้วข้ามการหา option เดิม (dry-run รายงานผิด)
    if (field.made) { totals.optionsMade++; return `NEW(${name})` }
    const { rows } = await pool.query(
      `SELECT id FROM kanban_field_options WHERE field_id = $1 AND name = $2`, [field.id, name])
    rows[0] ? totals.optionsReused++ : totals.optionsMade++
    return rows[0]?.id ?? `NEW(${name})`
  }

  const opt = await tagDB.ensureTagOption(field.id, name, {
    color: label.color || null,        // ⭐ ก็อปสีป้ายมาด้วย ไม่งั้นชื่อเดิมแต่สีเปลี่ยนทั้งกระดาน
    archivedAt: label.archived_at,     // ป้ายที่ซ่อนไว้ → option ที่ซ่อนไว้ ไม่ใช่หายไปเฉยๆ
  })
  if (!opt) return null
  opt.created ? totals.optionsMade++ : totals.optionsReused++
  return opt.id
}

/** เส้นเชื่อม card↔label → ค่าใน field (multi_select) หรือแถวงานย่อย (checklist) */
async function moveLinks(orgId, field, optionOf, totals) {
  const labelIds = [...optionOf.keys()]
  if (!labelIds.length) return

  const { rows: links } = await pool.query(
    `SELECT cl.card_id, cl.label_id
       FROM kanban_card_labels cl
       JOIN kanban_cards c ON c.id = cl.card_id AND c.org_id = $1
      WHERE cl.label_id = ANY($2::bigint[])
      ORDER BY cl.card_id`,
    [orgId, labelIds]
  )
  if (!links.length) { log(`    (ไม่มีการ์ดติดป้ายกลุ่มนี้)`); return }

  const byCard = new Map()
  for (const { card_id, label_id } of links) {
    if (!byCard.has(String(card_id))) byCard.set(String(card_id), [])
    byCard.get(String(card_id)).push(optionOf.get(String(label_id)))
  }
  log(`    ${links.length} เส้น → ${byCard.size} การ์ด`)

  if (!COMMIT) {
    OPTION_TYPES.includes(field.type) ? (totals.values += byCard.size) : (totals.items += links.length)
    return
  }

  let n = 0
  for (const [cardId, optIds] of byCard) {
    const r = await tagDB.addCardTags(orgId, cardId,
      optIds.map((optionId) => ({ fieldId: field.id, optionId, type: field.type })))
    totals.values += r.values
    totals.items += r.items
    if (++n % 20 === 0) process.stdout.write(`\r    เขียนแล้ว ${n}/${byCard.size}`)
  }
  if (n >= 20) process.stdout.write(`\r    เขียนแล้ว ${n}/${byCard.size}\n`)
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error('\n❌', e); pool.end(); process.exit(1) })
