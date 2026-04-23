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
  // dateStr: "27-11-25" (DD-MM-YY พ.ศ. 2 หลัก) หรือ "27-11-2025"
  if (!dateStr) return null
  const parts = dateStr.trim().split('-')
  if (parts.length !== 3) return null
  let [dd, mm, yy] = parts.map(Number)
  // KBank statement ใช้ ค.ศ.: 25=2025, 26=2026 (ไม่ใช่ พ.ศ.)
  if (yy < 100) yy += 2000
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
// format จริงจาก pdf-parse (ทุก field ต่อกันในบรรทัดเดียว ไม่มี separator):
//   27-11-2515:50K PLUS500.00จาก X0453 นาย อรรณพ++รับโอนเงิน500.00
//   วันที่      เวลา  ช่องทาง  ยอดคงเหลือ  รายละเอียด          จำนวน(ท้ายสุด)
//
// ยอดคงเหลือ และ จำนวนเงิน ต่อกัน — หาจำนวนเงินจากตัวเลขสุดท้าย
// type = income ถ้ารายละเอียดไม่ใช่โอนออก/ชำระเงิน
function parseRows(text) {
  const rows = []

  // merge wrapped lines: "ชื่อ+\n+\nรับโอนเงิน247.50" → "ชื่อ++รับโอนเงิน247.50"
  text = text.replace(/\+\n\+\n/g, '++')

  // แต่ละ row เริ่มด้วย DD-MM-YY หรือ DD-MM-YYYY ตามด้วย HH:MM
  const rowPattern = /(\d{2}-\d{2}-\d{2,4})(\d{2}:\d{2})(.+?)(?=\d{2}-\d{2}-\d{2,4}\d{2}:\d{2}|$)/gs

  let m
  while ((m = rowPattern.exec(text)) !== null) {
    const dateStr = m[1]
    const timeStr = m[2]
    const rest    = m[3].trim()

    // ตัด page footer ออกก่อน (KBPDF... หรือ "หน้าที่ (PAGE" หรือ "ชื่อบัญชี")
    const restClean = rest.split(/\nKBPDF|\nหน้าที่|\nชื่อบัญชี/)[0].trim()

    // ข้าม page-break rows (ยอดยกมา / header ซ้ำ) — ใช้ restClean แทน rest
    if (/ยอดยกมา|วันที่มีผล/.test(restClean)) continue

    // จำนวนเงินอยู่ท้ายสุดก่อน trailing garbage (KBPDF, multiline branch ฯลฯ)
    // หา last money pattern ในทั้ง rest
    const allAmts = [...restClean.matchAll(/([\d,]+\.\d{2})/g)]
    if (!allAmts.length) continue
    const lastAmt = allAmts[allAmts.length - 1]

    const amount = parseMoney(lastAmt[1])
    if (!amount || amount === 0) continue

    const body = restClean.slice(0, lastAmt.index).trim()

    // ยอดคงเหลืออยู่ก่อน description — หา pattern ตัวเลข ตามด้วย "จาก"|"รหัส"|"โอน"|"ชำระ"
    // ช่องทาง: K PLUS, EDC/K SHOP/MYQR, Internet/Mobile SCB, MAKE by KBank, สาขา...
    // extract ช่องทางและ description จาก body
    let channel = null
    let description = body
    let counterpart_name = null

    // หาช่องทาง (alphanumeric/slash/space ก่อน ยอดคงเหลือ)
    const chanMatch = body.match(/^(Internet\/Mobile [A-Za-zก-๙]+(?:\s+[A-Za-zก-๙]+)*|K-Cash Connect Plus|K BIZ|K PLUS|EDC\/K SHOP\/MYQR|MAKE by KBank|LINE BK|โอนเข้า\/หักบัญชีอัตโนมัติ|เคแบงก์เซอร์วิสที่ 7-11|สาขา[^\d]+?(?=\d)|PromptPay|SCB Easy|[A-Z]{2,6}(?=\d))/)
    if (chanMatch) {
      channel = chanMatch[1]
      description = body.slice(chanMatch[0].length).trim()
    }

    // ยอดคงเหลืออยู่ต้น description — เก็บไว้แล้วตัดออก
    const balMatch = description.match(/^([\d,]+\.\d{2})/)
    const balance_after = balMatch ? parseMoney(balMatch[1]) : null
    description = description.replace(/^[\d,]+\.\d{2}/, '').trim()

    // counterpart_account + counterpart_name
    // income: "จาก X0453 นาย อรรณพ++" หรือ "จาก SCB X7942 นางสาว กัญญา++"
    // expense: "โอนไป KTB X1577 นายธีรวุฒิ++" หรือ "โอนไป X3482 น.ส. อัจฉรา++"
    let counterpart_account = null
    const cpMatch = description.match(/(?:จาก|โอนไป)\s+(?:[A-Za-zก-๙]+\s+)?(X\S+)\s+(.+?)(?:\+\+|$)/)
    if (cpMatch) {
      counterpart_account = cpMatch[1].trim()
      counterpart_name    = cpMatch[2].trim()
    }

    // ref_id: ไม่เก็บเป็น key เพราะ KPP ซ้ำได้ → ต่อท้าย description แทน
    const ref_id = null
    const kppMatch = description.match(/รหัสอ้างอิง\s+([A-Za-z0-9]+)/)
    const kppCode = kppMatch ? kppMatch[1] : null

    // description: เอาเฉพาะประเภทรายการท้ายสุด (รับโอนเงิน, รับโอนเงินผ่าน QR, โอนเงิน ฯลฯ)
    // normalize สระอำ 2 แบบ (ชํา → ชำ)
    const descNorm = description.replace(/ชํา/g, 'ชำ')

    const txnTypeMatch = descNorm.match(/(รับโอนเงินผ่าน QR|รับโอนเงิน|โอนเงิน|ชำระเงิน|เปิดบัญชี|ดอกเบี้ย\S*|ฝากเงินสด)/)
    const txnType = txnTypeMatch
      ? (kppCode ? `${txnTypeMatch[1]} (${kppCode})` : txnTypeMatch[1])
      : descNorm

    // counterpart จาก "เพื่อชำระ Ref X9194 ชื่อบริษัท"
    if (!counterpart_account) {
      const payMatch = descNorm.match(/เพื่อชำระ\s+Ref\s+(\S+)\s+(.+?)(?:ชำระ|$)/)
      if (payMatch) {
        counterpart_account = payMatch[1].trim()
        counterpart_name    = payMatch[2].trim() || null
      }
    }

    // type: expense ถ้ามี "โอนเงิน" หรือ "ชำระเงิน" โดยไม่มี "รับโอน"
    const isExpense = /โอนเงิน|ชำระเงิน/.test(descNorm) && !/รับโอน/.test(descNorm)
    const type = isExpense ? 'expense' : 'income'

    const txn_at = parseThaiDate(dateStr, timeStr)
    if (!txn_at) continue

    rows.push({
      txn_at,
      txn_at_str: toSQLDatetime(txn_at),
      type,
      amount,
      balance_after,
      description: txnType,
      counterpart_name,
      counterpart_account,
      channel,
      ref_id,
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
  const debugPath = path.join(path.dirname(pdfPath), 'kbank_statement_raw.txt')
  fs.writeFileSync(debugPath, data.text)
  console.log(`📝 Raw text saved: ${debugPath}`)

  // อ่านจากไฟล์ที่ save ไว้แทน เพื่อให้ newline consistent
  const rawText = fs.readFileSync(debugPath, 'utf8')
  const rows = parseRows(rawText)
  console.log(`✅ Parsed rows: ${rows.length}`)

  if (rows.length === 0) {
    console.error('❌ ไม่พบ row เลย — ดู kbank_statement_raw.txt แล้วส่งมาให้ดู')
    process.exit(1)
  }

  // ── Excel ──────────────────────────────────────────────────────────────────
  const xlsxData = rows.map((r, i) => ({
    '#':                    i + 1,
    'txn_at':               r.txn_at_str,
    'type':                 r.type,
    'amount':               r.amount,
    'balance_after':        r.balance_after ?? '',
    'description':          r.description,
    'counterpart_bank':     r.channel ?? '',
    'counterpart_account':  r.counterpart_account ?? '',
    'counterpart_name':     r.counterpart_name ?? '',
    'ref_id':               r.ref_id ?? '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(xlsxData)
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions')
  const xlsxPath = path.join(path.dirname(pdfPath), 'kbank_statement.xlsx')
  XLSX.writeFile(wb, xlsxPath)
  console.log(`📊 Excel saved: ${xlsxPath}`)

  // ── SQL ────────────────────────────────────────────────────────────────────
  const sqlLines = [
    `-- KBank statement import`,
    `-- account_id=${accountId} guild_id=${guildId}`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Rows: ${rows.length}`,
    '',
    //`DELETE FROM finance_transactions WHERE account_id=${accountId};`,
    '',
  ]

  for (const r of rows) {
    sqlLines.push(
      `INSERT IGNORE INTO finance_transactions ` +
      `(guild_id, account_id, type, amount, description, counterpart_name, counterpart_account, counterpart_bank, ref_id, balance_after, txn_at, updated_by, updated_at) ` +
      `VALUES (` +
      `${escSQL(guildId)}, ${accountId}, ${escSQL(r.type)}, ${r.amount}, ` +
      `${escSQL(r.description)}, ${escSQL(r.counterpart_name)}, ${escSQL(r.counterpart_account)}, ${escSQL(r.channel || 'กสิกรไทย')}, ` +
      `${escSQL(r.ref_id)}, ${r.balance_after ?? 'NULL'}, ${escSQL(r.txn_at_str)}, ${escSQL('statement_import')}, NOW()` +
      `);`
    )
  }

  const sqlPath = path.join(path.dirname(pdfPath), 'kbank_statement.sql')
  fs.writeFileSync(sqlPath, sqlLines.join('\n'))
  console.log(`🗄️  SQL saved: ${sqlPath}`)

  console.log(`\n📊 Summary:`)
  console.log(`   income:  ${rows.filter(r => r.type === 'income').length} rows`)
  console.log(`   expense: ${rows.filter(r => r.type === 'expense').length} rows`)
  console.log(`\nตรวจสอบ ${sqlPath}`)
})()
