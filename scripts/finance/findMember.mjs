/**
 * หาสมาชิกจาก username / discord_id — อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น
 *
 * มีไว้ตอบคำถามเดียว: "คนนี้อยู่ใน org ไหม ชื่อในระบบสะกดยังไง มีข้อมูลรับเงินหรือยัง"
 * ใช้คู่กับ backfillBankInfo.mjs ตอนมีแถวขึ้นว่า "ไม่พบผู้ใช้ @xxx"
 * (บน prod ยิง query ตรงไม่ได้ ต้องผ่านสคริปต์ใน git — ดู CLAUDE.md §Production)
 *
 * รัน:
 *   node --import ./scripts/smoke/_envload.mjs scripts/finance/findMember.mjs namfon05_ 1149558478474575902
 *   … --org 1     ระบุ org (ค่าเริ่มต้น 1)
 */
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pg = require('pg')

const args = process.argv.slice(2)
const ORG_ID = Number(args.includes('--org') ? args[args.indexOf('--org') + 1] : 1) || 1
const orgValue = args.includes('--org') ? args[args.indexOf('--org') + 1] : null
const terms = args.filter(a => !a.startsWith('--') && a !== orgValue)

if (!terms.length) {
  console.error('usage: findMember.mjs <username|discord_id|บางส่วนของชื่อ> … [--org 1]')
  process.exit(1)
}

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'pple_volunteers',
})

console.log(`org ${ORG_ID} · ค้น ${terms.length} คำ (อ่านอย่างเดียว)\n`)

for (const term of terms) {
  // ตัด "." ท้ายทิ้งทั้งสองฝั่ง (Google Sheets กินจุดท้ายเซลล์) + เผื่อค้นแบบขึ้นต้นด้วย
  const { rows } = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.discord_id, u.firstname, u.lastname,
            EXISTS (SELECT 1 FROM org_members om
                     WHERE om.user_id = u.id AND om.org_id = $2) AS in_org,
            (SELECT COALESCE(om.account_no, om.promptpay_id) IS NOT NULL
               FROM org_members om
              WHERE om.user_id = u.id AND om.org_id = $2
              ORDER BY (COALESCE(om.account_no, om.promptpay_id) IS NOT NULL) DESC, om.id
              LIMIT 1) AS has_payment
       FROM users u
      WHERE rtrim(lower(u.username), '.') = rtrim(lower($1), '.')
         OR u.discord_id = $1
         OR lower(u.username) LIKE lower($1) || '%'
      ORDER BY u.id
      LIMIT 10`,
    [term, ORG_ID]
  )

  if (!rows.length) { console.log(`"${term}" → ไม่พบเลย`); continue }
  console.log(`"${term}" → ${rows.length} คน`)
  for (const r of rows) {
    const name = [r.firstname, r.lastname].filter(Boolean).join(' ') || '—'
    console.log(`   @${String(r.username).padEnd(24)} id=${String(r.id).padEnd(7)} discord=${r.discord_id || '—'}`)
    console.log(`     ${name} · ${r.in_org ? `อยู่ใน org ${ORG_ID}` : `⚠️ ไม่ได้อยู่ใน org ${ORG_ID}`} · ${r.has_payment ? 'มีข้อมูลรับเงินแล้ว' : 'ยังไม่มีข้อมูลรับเงิน'}`)
  }
  console.log('')
}

await pool.end()
