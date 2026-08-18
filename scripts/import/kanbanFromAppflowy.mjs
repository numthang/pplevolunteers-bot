// scripts/import/kanbanFromAppflowy.mjs — นำเข้าการบ้านจาก AppFlowy (xlsx)
//
//   node --env-file=.env scripts/import/kanbanFromAppflowy.mjs --map        → สร้างไฟล์จับคู่ชื่อคน
//   node --env-file=.env scripts/import/kanbanFromAppflowy.mjs              → DRY-RUN (ไม่เขียน DB)
//   node --env-file=.env scripts/import/kanbanFromAppflowy.mjs --commit     → เขียนจริง
//   ... --all        → เอาทั้ง 83 ใบ (ปกติเอาเฉพาะ 33 ใบที่ยังไม่จบ)
//   ... --file <path> --org <id> --guild <guildId>   (--guild ช่วยตัดชื่อซ้ำ)
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
// ⭐ ป้ายถูกยุบเข้า custom field แล้ว 2026-08-19 — เขียนผ่าน tags.js ไม่ใช่ labels.js (ที่ลบทิ้งไปแล้ว)
//    LABEL_GROUPS ข้างล่างยังใช้ชื่อเดิมได้: ชื่อกลุ่ม = ชื่อ field ตรงๆ (ไม่มีก็สร้างให้)
const tagDB = await import('../../web/db/kanban/tags.js')

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d }

const FILE = val('--file', 'backups/kanban/kanban_import.xlsx')
const ORG = Number(val('--org', 1))
const COMMIT = has('--commit')
const ALL = has('--all')
const GUILD = val('--guild', null)   // เซิร์ฟของทีม — ใช้ตัดตอนชื่อซ้ำ ไม่ hardcode ในโค้ด
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

  // ⚠️ **ห้ามใช้ DISTINCT ON (u.id) ตอนค้นชื่อ** — display_name/nickname เก็บ "ต่อเซิร์ฟ"
  //    คนคนเดียวมีชื่อแสดงคนละอย่างในแต่ละเซิร์ฟ · DISTINCT ON เลือกมาแถวเดียวแล้วทิ้งที่เหลือ
  //    → ชื่อที่ตรงอยู่ในแถวที่ถูกทิ้ง = หาไม่เจอทั้งที่มีอยู่จริง (เจอ 2026-08-17: Milk, Ti หายไปแบบนี้)
  //    ค้นทุกแถวก่อน แล้วค่อยยุบเป็นรายคนทีหลัง
  const { rows: memberRows } = await pool.query(
    `SELECT m.user_id AS id, m.guild_id, m.display_name, m.nickname,
            u.username, u.firstname,
            COALESCE(NULLIF(TRIM(m.display_name), ''),
                     NULLIF(TRIM(CONCAT_WS(' ', u.firstname, u.lastname)), ''),
                     u.username) AS display
       FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = $1`, [ORG])

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9ก-๙]/g, '')
  const words = (s) => String(s || '').toLowerCase().split(/[\s._-]+/).filter(Boolean)

  // ยุบรายคน เก็บชื่อทุกแบบที่คนนี้เคยใช้ (ทุกเซิร์ฟ) ไว้เทียบ
  const byUser = new Map()
  for (const r of memberRows) {
    if (!byUser.has(r.id)) byUser.set(r.id, { id: r.id, display: r.display, username: r.username, guilds: new Set(), nicknames: new Set(), displays: new Set(), firstnames: new Set() })
    const u = byUser.get(r.id)
    if (r.guild_id) u.guilds.add(r.guild_id)
    if (r.nickname) u.nicknames.add(norm(r.nickname))
    if (r.display_name) u.displays.add(norm(r.display_name))
    if (r.firstname) u.firstnames.add(norm(r.firstname))
  }
  const users = [...byUser.values()]

  // ⚠️ **ไล่เป็นลำดับชั้น ห้ามกองรวมกัน** — เดิมเอาทุกเงื่อนไขมา OR กันแล้วเช็ค "เจอคนเดียวไหม"
  //    ผลคือชื่อที่ตรงเป๊ะ 1 คน แต่มีคนอื่นเข้าเงื่อนไขหลวมด้วย → กลายเป็น "ซ้ำ" แล้วไม่เติมให้
  //    ชั้นบนชนะเสมอ: ชื่อเล่นที่กรอกเอง > ชื่อที่แสดง > username > ชื่อจริง > คำในชื่อ
  const TIERS = [
    (n, u) => u.nicknames.has(norm(n)),
    (n, u) => u.displays.has(norm(n)),
    (n, u) => norm(u.username) === norm(n),
    (n, u) => u.firstnames.has(norm(n)),
    (n, u) => words(u.display).includes(n.toLowerCase()),
  ]

  const resolve = (nick) => {
    for (const test of TIERS) {
      const hit = users.filter(u => test(nick, u))
      if (!hit.length) continue
      if (hit.length === 1) return { pick: hit[0], hit }
      // ยังซ้ำ → ถ้าบอกเซิร์ฟของทีมมา ใช้ตัดต่อ (ไม่ hardcode เซิร์ฟไหนในโค้ด)
      if (GUILD) {
        const inGuild = hit.filter(u => u.guilds.has(GUILD))
        if (inGuild.length === 1) return { pick: inGuild[0], hit }
      }
      return { pick: null, hit }
    }
    return { pick: null, hit: [] }
  }

  const map = {}
  const hints = {}
  for (const n of [...names].sort()) {
    const { pick, hit } = resolve(n)
    map[n] = pick ? pick.id : null
    if (!pick && hit.length) {
      hints[n] = hit.slice(0, 6).map(u => `${u.id} = ${u.display} (@${u.username})${u.guilds.has(GUILD) ? ' ★อยู่เซิร์ฟที่ระบุ' : ''}`)
    }
  }
  const sure = Object.values(map).filter(Boolean).length

  fs.writeFileSync(MAP_FILE, JSON.stringify({
    _readme: 'ใส่ users.id (เลข) หรือ discord_id (สตริง 17-20 หลัก) ก็ได้ · null = ข้าม (การ์ดจะไม่มีเจ้าภาพ อยู่ช่องรอรับ)',
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

/**
 * อ่านไฟล์จับคู่ + แปลง discord_id → users.id ให้เอง
 *
 * รับได้ 2 แบบในช่องเดียวกัน — คนกรอกไม่ต้องแปลงเอง:
 *   "Tee": 1                      ← users.id (เลขน้อย)
 *   "Tee": "1098111730015543386"  ← discord_id (snowflake 17-20 หลัก เป็นสตริง)
 * discord_id แม่นกว่าเพราะเป็น "ตัวระบุ" ไม่ใช่ชื่อที่ซ้ำกันได้
 */
async function loadMap() {
  if (!fs.existsSync(MAP_FILE)) return {}
  let raw
  try { raw = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')).map || {} } catch { return {} }

  const out = {}
  const unresolved = []
  for (const [nick, v] of Object.entries(raw)) {
    if (v == null || v === '') { out[nick] = null; continue }
    const str = String(v).trim()
    if (/^\d{15,}$/.test(str)) {          // snowflake = discord_id
      const { rows } = await pool.query(`SELECT id FROM users WHERE discord_id = $1`, [str])
      if (rows[0]) out[nick] = rows[0].id
      else { out[nick] = null; unresolved.push(`${nick} (discord_id ${str} ไม่มีใน users)`) }
    } else {
      out[nick] = Number(str) || null
    }
  }
  if (unresolved.length) {
    console.log('⚠️ แปลง discord_id ไม่ได้:')
    unresolved.forEach(u => console.log('   ' + u))
    console.log('   (คนนั้นยังไม่เคยเข้าเว็บ/ยังไม่มีแถวใน users — การ์ดจะไม่มีเจ้าภาพ)\n')
  }
  return out
}

async function main() {
  const rows = readRows()

  if (has('--map')) { await writeMapTemplate(rows); return }

  const target = ALL ? rows : rows.filter(r => LIVE.includes(r.Status))
  const people = await loadMap()
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

  const stat = { created: 0, labels: 0, noOwner: 0, helpers: 0, bumped: 0, provenance: 0, skipped: 0, errors: 0 }
  const labelCache = new Map()

  /** ชื่อกลุ่ม+ชื่อแท็ก → { fieldId, optionId, type } · cache กันยิงซ้ำทุกแถว */
  async function labelId(groupName, name) {
    const key = `${groupName}::${name}`
    if (labelCache.has(key)) return labelCache.get(key)
    if (!COMMIT) { labelCache.set(key, `(ใหม่)`); return `(ใหม่)` }
    const tg = await tagDB.ensureTag(ORG, groupName, name)
    labelCache.set(key, tg)
    return tg
  }

  for (const [i, r] of target.entries()) {
    const title = String(r.Title).trim()
    try {
      const rawOwners = splitList(r['ผู้รับผิดชอบ'])
      const unmapped = rawOwners.filter(n => !people[n])
      const owners = rawOwners.map(n => people[n]).filter(Boolean)
      const ownerUserId = owners[0] || null          // คนแรกในลิสต์ = เจ้าภาพ
      const helperIds = [...new Set(owners.slice(1))]
      if (!ownerUserId) stat.noOwner++

      const { start, due } = parseDate(r.Date)
      // "สิ่งที่ต้องทำ" + มีเจ้าภาพ = สภาพที่ 6 ประเภทของเราไม่มี (assigned แต่ยังไม่เริ่ม)
      // เลือกเก็บ "ใครถือ" ไว้ เพราะมีค่ากว่าการแยก เริ่มแล้ว/ยังไม่เริ่ม → createCard เลื่อนเป็น doing ให้เอง
      // คนที่จับคู่ไม่ได้ (ลาออก/ไม่ active) — เก็บชื่อเดิมไว้เป็น "บันทึกที่มา" ในรายละเอียด
      // ⛔ ไม่ทำเป็นคอลัมน์ owner แบบข้อความ — จะกลายเป็นเจ้าภาพ 2 ที่ (id กับ text)
      //    ซึ่งเป็นกับดักเดียวกับ "สถานะอยู่ 2 ที่" ที่ทั้งดีไซน์พยายามเลี่ยง
      //    ข้อมูลนี้เป็น display-only → ตามกฎใน CUSTOM-FIELDS.md ไม่เข้าข่ายคอลัมน์จริง
      const provenance = unmapped.length
        ? `\n\n— นำเข้าจาก AppFlowy · ผู้รับผิดชอบเดิมที่ยังไม่ได้ผูกบัญชี: ${unmapped.join(', ')}`
        : ''
      if (unmapped.length) stat.provenance++

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
        detail: ((r.Description ? String(r.Description).trim() : '') + provenance) || null,
        ownerUserId, startAt: start, dueAt: due, statusType: status,
      }, importerId)

      // ⚠️ addCardTags **เพิ่ม** ไม่ทับของเดิม (ต่างจาก setCardLabels ตัวเก่าที่เขียนทับทั้งชุด)
      //    import ไม่ควรลบค่าที่คนกรอกเองในการ์ดที่มีอยู่แล้ว
      if (labelIds.length) await tagDB.addCardTags(ORG, card.id, labelIds.filter(Boolean))
      for (const h of helperIds) await cardDB.addHelper(ORG, card.id, h)

      stat.created++; stat.labels += labelIds.length; stat.helpers += helperIds.length
      process.stdout.write(`\r  ${stat.created}/${target.length} (${stat.errors} errors)`)
    } catch (err) {
      stat.errors++
      console.error(`\n  ❌ "${title.slice(0, 40)}": ${err.message}`)
    }
  }

  console.log(`\n\nสรุป: การ์ด ${stat.created} · ป้าย ${stat.labels} · คนช่วย ${stat.helpers} · ไม่มีเจ้าภาพ ${stat.noOwner} · error ${stat.errors}`)
  if (stat.provenance) console.log(`  📝 ${stat.provenance} ใบจดชื่อผู้รับผิดชอบเดิมไว้ในรายละเอียด (คนที่ยังไม่ได้ผูกบัญชี)`)
  if (stat.bumped) console.log(`  ⚠️ ${stat.bumped} ใบเป็น "สิ่งที่ต้องทำ" แต่มีเจ้าภาพ → เลื่อนเป็น "กำลังทำ" (6 ประเภทไม่มีสภาพ assigned-แต่ยังไม่เริ่ม)`)
  if (!COMMIT) console.log('\n🔵 DRY-RUN — ยังไม่เขียนอะไรลง DB · ใส่ --commit เพื่อเขียนจริง')
}

try { await main() } finally { await pool.end() }
