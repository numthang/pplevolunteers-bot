// scripts/import/kanbanFromAppflowy.mjs — นำเข้าการบ้านจาก AppFlowy (xlsx)
//
//   node --env-file=.env scripts/import/kanbanFromAppflowy.mjs --map        → สร้างไฟล์จับคู่ชื่อคน
//   node --env-file=.env scripts/import/kanbanFromAppflowy.mjs              → DRY-RUN (ไม่เขียน DB)
//   node --env-file=.env scripts/import/kanbanFromAppflowy.mjs --commit     → เขียนจริง
//   ... --all        → เอาทั้ง 83 ใบ (ปกติเอาเฉพาะ 33 ใบที่ยังไม่จบ)
//   ... --file <path> --org <id>
//
// ⚠️ **รอบแรกเอาเฉพาะงานที่ยังไม่จบ** (md/kanban/CUSTOM-FIELDS.md)
//    งานที่จบแล้ว 50 ใบใช้ อำเภอ/งบประมาณ หนักกว่ามาก รอ custom field ก่อนค่อยเอาเข้า
//
// ⚠️ ที่ **ไม่** นำเข้า และเป็นการตั้งใจ:
//    - งบประมาณ → ยังไม่มีที่เก็บ (รอ custom field) · ใช้ในงานที่ยังเดินอยู่แค่ 3 ใบ
//    - Checklist → ไฟล์ export มาเป็น % (0.73) ไม่มีตัวข้อความ **ข้อมูลหายตั้งแต่ต้นทาง กู้ไม่ได้**
//    - FB Post   → ยังไม่มีตารางลิงก์ภายนอก (ก้อน 4) · ไม่สร้าง field แยกตามที่เคาะไว้
//    - Discord   → เหตุผลเดียวกับ FB Post
//    ทั้ง 4 อย่างยังอยู่ในไฟล์ต้นทางใน repo — backfill ทีหลังได้
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const pool = (await import('../../web/db/index.js')).default
const cardDB = await import('../../web/db/kanban/cards.js')
const labelDB = await import('../../web/db/kanban/labels.js')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }

const FILE = val('--file', 'backups/kanban/kanban_import.xlsx')
const ORG = Number(val('--org', 1))
const COMMIT = has('--commit')
const ALL = has('--all')
const MAP_FILE = path.join(path.dirname(FILE), 'people-map.json')

// AppFlowy → ประเภทสถานะ 6 แบบของเรา (md/kanban/KANBAN.md §ประเภทสถานะ)
const STATUS_MAP = {
  'สิ่งที่ต้องทำ': 'backlog',
  'กำลังทำ':      'doing',
  'รอยืนยัน':     'review',
  'เสร็จแล้ว':    'done',
}
const LIVE = ['สิ่งที่ต้องทำ', 'กำลังทำ', 'รอยืนยัน']

// คอลัมน์ใน xlsx → กลุ่มป้ายของเรา · ชื่อกลุ่มเป็นข้อมูล ไม่ใช่ค่าคงที่ในโค้ดหลัก
const LABEL_GROUPS = { category: 'สายงาน', 'อำเภอ': 'พื้นที่', 'อุปกรณ์': 'อุปกรณ์' }

const splitList = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean)

/** "Nov 17, 2025 → Nov 23, 2025" → { start, due } เป็นสตริง local ที่ pg รับตรงๆ */
function parseDate(raw) {
  if (!raw) return { start: null, due: null }
  const parts = String(raw).split('→').map(s => s.trim()).filter(Boolean)
  const toLocal = (s) => {
    const d = new Date(s + ' 00:00:00')
    if (Number.isNaN(d.getTime())) return null
    const p = (n) => String(n).padStart(2, '0')
    // ⚠️ ประกอบสตริงเอง ห้ามใช้ toISOString() — Node ทำงานใน UTC จะเลื่อนวัน
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 00:00:00`
  }
  if (parts.length >= 2) return { start: toLocal(parts[0]), due: toLocal(parts[1]) }
  return { start: null, due: toLocal(parts[0]) }
}

function readRows() {
  const wb = XLSX.readFile(FILE)
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null })
  return rows.filter(r => String(r.Title || '').trim())   // แถวไม่มีชื่องาน = ทิ้ง
}

/** โหมด --map: รวมชื่อเล่นทั้งหมด + เดาคู่จาก users แล้วเขียนไฟล์ให้คนมาแก้ */
async function writeMapTemplate(rows) {
  const names = new Set()
  rows.forEach(r => splitList(r['ผู้รับผิดชอบ']).forEach(n => names.add(n)))

  // ⚠️ DISTINCT ON จำเป็น — org_members มี 1 แถวต่อ (คน × เซิร์ฟ) และ org นี้มี 3 เซิร์ฟ
  //    คนที่อยู่ครบ 3 เซิร์ฟจะมี 3 แถว → ถ้าไม่ตัดซ้ำ เงื่อนไข "เจอคนเดียวถึงเติมให้"
  //    จะเป็นเท็จตลอดสำหรับคนที่อยู่หลายเซิร์ฟ = auto-fill หายเงียบ (เจอจริง 2026-08-16)
  //
  // nickname/display_name ของ org_members เป็นตัวจับคู่ที่ดีที่สุด — ชื่อเล่นใน AppFlowy
  // คือชื่อเล่นชุดเดียวกับที่คนกรอกไว้ในระบบ (Tee → user 1, Bank → user 46)
  const { rows: users } = await pool.query(
    `SELECT DISTINCT ON (u.id)
            u.id, u.username,
            NULLIF(TRIM(m.nickname), '')     AS nickname,
            COALESCE(NULLIF(TRIM(m.display_name), ''),
                     NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''),
                     u.username)             AS display
       FROM users u JOIN org_members m ON m.user_id = u.id
      WHERE m.org_id = $1
      ORDER BY u.id, (m.nickname IS NULL), m.id`, [ORG])

  // ⚠️ **ห้ามเดาด้วย "ชื่อมีคำนี้อยู่"** — ชื่อเล่นสั้น 2-3 ตัวอักษรจะแมตช์มั่วทันที
  //    ของจริงที่เจอ 2026-08-16: Nu → "moonut5376" · Ti → "artidaksorn" · Nuu → "dr.aswin…nuu…"
  //    เติมให้อัตโนมัติแบบนั้น = การ์ดไปอยู่กับอาสาที่ไม่เกี่ยวข้องเลย แล้วไม่มีใครรู้ตัว
  //    → เติมให้เฉพาะที่ "มั่นใจจริง" ที่เหลือปล่อย null แล้วแนบตัวเลือกให้คนเลือกเอง
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ก-๙]/g, '')
  const words = (s) => String(s || '').toLowerCase().split(/[\s._-]+/).filter(Boolean)

  const strong = (nick, u) => {
    const n = norm(nick)
    return norm(u.nickname) === n                  // ชื่อเล่นที่เจ้าตัวกรอกไว้ ← สัญญาณดีที่สุด
        || norm(u.username) === n                  // username ตรงเป๊ะ
        || words(u.display).includes(nick.toLowerCase())  // เป็น "คำ" เต็มคำในชื่อที่แสดง
  }
  // ตัวเลือกให้คนดู — หลวมได้ เพราะคนเป็นคนตัดสิน ไม่ใช่สคริปต์
  const candidates = (nick) => {
    const n = norm(nick)
    return users
      .filter(u => norm(u.nickname).startsWith(n) || norm(u.username).startsWith(n) || norm(u.display).includes(n))
      .slice(0, 5)
      .map(u => `${u.id} = ${u.display}${u.nickname ? ` [${u.nickname}]` : ''} (@${u.username})`)
  }

  const map = {}
  const hints = {}
  for (const n of [...names].sort()) {
    const hit = users.filter(u => strong(n, u))
    if (hit.length === 1) { map[n] = hit[0].id; continue }   // มั่นใจเฉพาะตอนเจอคนเดียว
    map[n] = null
    const c = candidates(n)
    if (c.length) hints[n] = c
  }
  const sure = Object.values(map).filter(Boolean).length

  fs.writeFileSync(MAP_FILE, JSON.stringify({
    _readme: 'ใส่ users.id ของแต่ละชื่อเล่นใน "map" · null = ข้าม (การ์ดจะไม่มีเจ้าภาพ อยู่ช่องรอรับ)',
    _warning: 'เติมให้อัตโนมัติเฉพาะที่ตรงเป๊ะเท่านั้น — ที่เหลือดู candidates แล้วเลือกเอง อย่าเชื่อลำดับใน candidates',
    _org: ORG,
    map,
    candidates: hints,
  }, null, 2))

  console.log(`เขียน ${MAP_FILE}`)
  console.log(`  ชื่อเล่นทั้งหมด ${names.size} คน`)
  console.log(`  ✅ เติมให้แล้ว (ตรงเป๊ะ) ${sure} คน`)
  console.log(`  ⬜ ต้องเลือกเอง ${names.size - sure} คน — มีตัวเลือกแนบให้ ${Object.keys(hints).length} คน`)
  console.log(`  (คนใน org นี้มี ${users.length} คน — ตัดซ้ำข้ามเซิร์ฟแล้ว)`)
}

function loadMap() {
  if (!fs.existsSync(MAP_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')).map || {} } catch { return {} }
}

async function main() {
  const rows = readRows()

  if (has('--map')) { await writeMapTemplate(rows); return }

  const target = ALL ? rows : rows.filter(r => LIVE.includes(r.Status))
  const people = loadMap()
  const mappedCount = Object.values(people).filter(Boolean).length

  console.log(`ไฟล์: ${FILE}`)
  console.log(`org: ${ORG} · โหมด: ${COMMIT ? '🔴 เขียนจริง' : '🔵 DRY-RUN'}`)
  console.log(`แถวทั้งหมด ${rows.length} → จะนำเข้า ${target.length} ใบ (${ALL ? 'ทั้งหมด' : 'เฉพาะงานที่ยังไม่จบ'})`)
  console.log(`จับคู่ชื่อคนไว้ ${mappedCount} คน${mappedCount ? '' : ' ⚠️ ยังไม่ได้จับคู่เลย — การ์ดจะไม่มีเจ้าภาพทั้งหมด (รัน --map ก่อน)'}\n`)

  // คนสร้างการ์ด import — ใช้คนแรกที่จับคู่ไว้ ไม่งั้น admin ของ org
  let importerId = Object.values(people).find(Boolean) || null
  if (!importerId) {
    const { rows: any } = await pool.query(
      `SELECT user_id FROM org_members WHERE org_id = $1 ORDER BY user_id LIMIT 1`, [ORG])
    importerId = any[0]?.user_id
  }
  if (!importerId) throw new Error(`org ${ORG} ไม่มีสมาชิกเลย — สร้างการ์ดไม่ได้`)

  const stat = { created: 0, labels: 0, noOwner: 0, helpers: 0, bumped: 0, skipped: 0, errors: 0 }
  const labelCache = new Map()

  async function labelId(groupName, name) {
    const key = `${groupName}::${name}`
    if (labelCache.has(key)) return labelCache.get(key)
    if (!COMMIT) { labelCache.set(key, `(ใหม่)`); return `(ใหม่)` }
    const l = await labelDB.ensureLabel(ORG, { name, groupName })
    labelCache.set(key, l.id)
    return l.id
  }

  for (const [i, r] of target.entries()) {
    const title = String(r.Title).trim()
    try {
      const owners = splitList(r['ผู้รับผิดชอบ']).map(n => people[n]).filter(Boolean)
      const ownerUserId = owners[0] || null          // คนแรกในลิสต์ = เจ้าภาพ
      const helperIds = [...new Set(owners.slice(1))]
      if (!ownerUserId) stat.noOwner++

      const { start, due } = parseDate(r.Date)
      // "สิ่งที่ต้องทำ" + มีเจ้าภาพ = สภาพที่ 6 ประเภทของเราไม่มี (assigned แต่ยังไม่เริ่ม)
      // เลือกเก็บ "ใครถือ" ไว้ เพราะมีค่ากว่าการแยก เริ่มแล้ว/ยังไม่เริ่ม → createCard เลื่อนเป็น doing ให้เอง
      const status = ownerUserId ? (STATUS_MAP[r.Status] || 'backlog') : 'backlog'
      if (ownerUserId && status === 'backlog') stat.bumped++

      const labelIds = []
      for (const [col, group] of Object.entries(LABEL_GROUPS)) {
        for (const name of splitList(r[col])) labelIds.push(await labelId(group, name))
      }

      if (!COMMIT) {
        if (i < 5) {
          console.log(`  [${r.Status}] ${title.slice(0, 46)}`)
          console.log(`      เจ้าภาพ=${ownerUserId || '—'} คนช่วย=${helperIds.length} ป้าย=${labelIds.length} เริ่ม=${start || '—'} ส่ง=${due || '—'} → ${status}`)
        }
        stat.created++; stat.labels += labelIds.length; stat.helpers += helperIds.length
        continue
      }

      const card = await cardDB.createCard(ORG, {
        title,
        detail: r.Description ? String(r.Description).trim() : null,
        ownerUserId, startAt: start, dueAt: due, statusType: status,
      }, importerId)

      if (labelIds.length) await labelDB.setCardLabels(ORG, card.id, labelIds)
      for (const h of helperIds) await cardDB.addHelper(ORG, card.id, h)

      stat.created++; stat.labels += labelIds.length; stat.helpers += helperIds.length
      process.stdout.write(`\r  ${stat.created}/${target.length} (${stat.errors} errors)`)
    } catch (err) {
      stat.errors++
      console.error(`\n  ❌ "${title.slice(0, 40)}": ${err.message}`)
    }
  }

  console.log(`\n\nสรุป: การ์ด ${stat.created} · ป้าย ${stat.labels} · คนช่วย ${stat.helpers} · ไม่มีเจ้าภาพ ${stat.noOwner} · error ${stat.errors}`)
  if (stat.bumped) console.log(`  ⚠️ ${stat.bumped} ใบเป็น "สิ่งที่ต้องทำ" แต่มีเจ้าภาพ → เลื่อนเป็น "กำลังทำ" (6 ประเภทไม่มีสภาพ assigned-แต่ยังไม่เริ่ม)`)
  if (!COMMIT) console.log('\n🔵 DRY-RUN — ยังไม่เขียนอะไรลง DB · ใส่ --commit เพื่อเขียนจริง')
}

try { await main() } finally { await pool.end() }
