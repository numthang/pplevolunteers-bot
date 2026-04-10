/**
 * parse-kbank-statement.js
 * แปลง KBank statement PDF → Excel + SQL
 *
 * Usage:
 *   node scripts/parse-kbank-statement.js <path-to-pdf> [account_id] [guild_id]
 *
 * Output:
 *   statement.xlsx   — เปิดตรวจสอบก่อน
 *   statement.sql    — INSERT IGNORE statements พร้อม import
 */

require('dotenv').config()
const fs       = require('fs')
const path     = require('path')
const pdfParse = require('pdf-parse')
const XLSX     = require('xlsx')

// ── args ────────────────────────────────────────────────────────────────────
const pdfPath   = process.argv[2]
const accountId = parseInt(process.argv[3] || '3')
const guildId   = process.argv[4] || process.env.GUILD_ID

if (!pdfPath) {
  console.error('Usage: node scripts/parse-kbank-statement.js <pdf> [account_id] [guild_id]')
  process.exit(1)
}
if (!guildId) {
  console.error('GUILD_ID not set — pass as arg or in .env')
  process.exit(1)
}

// ── Thai month map ───────────────────────────────────────────────────────────
const MONTHS = { 'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,
                 'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12 }

function parseThaiDate(dateStr, timeStr) {
  // dateStr: "01/11/68" หรือ "01/11/2568"
  // timeStr: "09:00" (optional)
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  let [dd, mm, yy] = parts.map(Number)
  if (yy > 2400) yy -= 543       // พ.ศ. 4 หลัก
  else if (yy > 100) yy -= 543   // พ.ศ. 2568 → 2025
  else yy = yy - 43 + 2000       // พ.ศ. 2 หลัก: 68 → 2025, 69 → 2026
  const [hh = 0, min = 0] = (timeStr || '').split(':').map(Number)
  const d = new Date(yy, mm - 1, dd, hh, min)
  return isNaN(d) ? null : d
}

function toSQLDatetime(d) {
  if (!d) return null
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

function parseMoney(s) {
  if (!s) return null
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function escSQL(s) {
  if (s == null) return 'NULL'
  return "'" + String(s).replace(/'/g, "''") + "'"
}

// ── KBank statement row parser ───────────────────────────────────────────────
// รูปแบบ text ใน PDF (หลัง pdf-parse):
//   วันที่      เวลา    รายการ                          ถอน         ฝาก        คงเหลือ
//   01/11/68   09:05   รับโอนเงิน จาก นาย ก ข ค       -         1,000.00   100,000.00
//
// pdf-parse อาจให้ text ต่อกันยาว ต้องหา pattern ทีละ row
function parseRows(text) {
  const rows = []

  // normalize
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // แต่ละ row เริ่มด้วย วันที่ format DD/MM/YY หรือ DD/MM/YYYY
  const rowPattern = /(\d{2}\/\d{2}\/\d{2,4})\s+(\d{2}:\d{2})\s+([\s\S]+?)(?=\d{2}\/\d{2}\/\d{2,4}\s+\d{2}:\d{2}|$)/g

  let m
  while ((m = rowPattern.exec(text)) !== null) {
    const dateStr  = m[1]
    const timeStr  = m[2]
    const rest     = m[3].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

    // ถอน / ฝาก / คงเหลือ — ตัวเลขท้ายสุด 3 ตัว
    // pattern: (ตัวเลข|-)  (ตัวเลข|-)  ตัวเลข  ต่อท้าย rest
    const moneyMatch = rest.match(/([\d,]+\.\d{2}|-)\s+([\d,]+\.\d{2}|-)\s+([\d,]+\.\d{2})\s*$/)
    if (!moneyMatch) continue

    const withdrawStr = moneyMatch[1] === '-' ? null : moneyMatch[1]
    const depositStr  = moneyMatch[2] === '-' ? null : moneyMatch[2]
    const balanceStr  = moneyMatch[3]

    const description = rest.slice(0, rest.lastIndexOf(moneyMatch[0])).trim()
    const withdraw    = parseMoney(withdrawStr)
    const deposit     = parseMoney(depositStr)
    const balance     = parseMoney(balanceStr)
    const txn_at      = parseThaiDate(dateStr, timeStr)

    if (!txn_at) continue
    if (withdraw == null && deposit == null) continue

    const type   = deposit != null ? 'income' : 'expense'
    const amount = deposit ?? withdraw

    // counterpart_name: บรรทัดหลัง "จาก" หรือ "โอนไป"
    let counterpart_name = null
    const fromMatch = description.match(/จาก\s+(.+)/)
    if (fromMatch) counterpart_name = fromMatch[1].trim()

    rows.push({
      txn_at,
      txn_at_str: toSQLDatetime(txn_at),
      type,
      amount,
      withdraw,
      deposit,
      balance,
      description,
      counterpart_name,
    })
  }

  return rows
}

// ── main ─────────────────────────────────────────────────────────────────────
;(async () => {
  console.log(`📖 Reading PDF: ${pdfPath}`)
  const buf  = fs.readFileSync(pdfPath)
  const data = await pdfParse(buf)

  console.log(`📄 Pages: ${data.numpages} | Text length: ${data.text.length}`)

  // debug: dump raw text ไว้ดู
  const debugPath = path.join(path.dirname(pdfPath), 'statement_raw.txt')
  fs.writeFileSync(debugPath, data.text)
  console.log(`📝 Raw text saved: ${debugPath}`)

  const rows = parseRows(data.text)
  console.log(`✅ Parsed rows: ${rows.length}`)

  if (rows.length === 0) {
    console.error('❌ ไม่พบ row เลย — ดู statement_raw.txt แล้วส่งมาให้ดู')
    process.exit(1)
  }

  // ── Excel ──────────────────────────────────────────────────────────────────
  const xlsxData = rows.map((r, i) => ({
    '#':               i + 1,
    'วันที่':          r.txn_at_str,
    'ประเภท':          r.type === 'income' ? 'รายรับ' : 'รายจ่าย',
    'จำนวน':           r.amount,
    'ถอน':             r.withdraw ?? '',
    'ฝาก':             r.deposit  ?? '',
    'คงเหลือ':         r.balance  ?? '',
    'รายละเอียด':      r.description,
    'คู่โอน':          r.counterpart_name ?? '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(xlsxData)
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  const xlsxPath = path.join(path.dirname(pdfPath), 'statement.xlsx')
  XLSX.writeFile(wb, xlsxPath)
  console.log(`📊 Excel saved: ${xlsxPath}`)

  // ── SQL ────────────────────────────────────────────────────────────────────
  const sqlLines = [
    `-- KBank statement import`,
    `-- account_id=${accountId} guild_id=${guildId}`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Rows: ${rows.length}`,
    '',
  ]

  for (const r of rows) {
    const description = r.description.replace(/'/g, "''")
    const counterpart = r.counterpart_name ? r.counterpart_name.replace(/'/g, "''") : null

    sqlLines.push(
      `INSERT IGNORE INTO finance_transactions ` +
      `(guild_id, account_id, type, amount, description, counterpart_name, counterpart_bank, txn_at, updated_by, updated_at) ` +
      `VALUES (` +
      `${escSQL(guildId)}, ${accountId}, ${escSQL(r.type)}, ${r.amount}, ` +
      `${escSQL(description)}, ${escSQL(counterpart)}, ${escSQL('กสิกรไทย')}, ` +
      `${escSQL(r.txn_at_str)}, ${escSQL('statement_import')}, NOW()` +
      `);`
    )
  }

  const sqlPath = path.join(path.dirname(pdfPath), 'statement.sql')
  fs.writeFileSync(sqlPath, sqlLines.join('\n'))
  console.log(`🗄️  SQL saved: ${sqlPath}`)

  console.log(`\n📊 Summary:`)
  console.log(`   income:  ${rows.filter(r => r.type === 'income').length} rows`)
  console.log(`   expense: ${rows.filter(r => r.type === 'expense').length} rows`)
  console.log(`\nตรวจสอบ statement.xlsx ก่อน แล้วค่อย run statement.sql`)
})()
