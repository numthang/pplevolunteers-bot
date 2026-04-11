/**
 * scbSlip.js
 * Parse OCR text จากสลิป SCB Easy (ไทยพาณิชย์)
 */

function norm(s) {
  return s ? s.replace(/\u0e4d\u0e32/g, '\u0e33').replace(/\u0e4d/g, '') : s
}

function parse(rawText) {
  if (!rawText) return null
  const text = norm(rawText)

  // SCB ใช้ "รหัสอ้างอิง:" แทน "เลขที่รายการ:"
  if (!text.includes('รหัสอ้างอิง')) return null

  // ---- ref_id: หลัง "รหัสอ้างอิง:" ----
  const refMatch = text.match(/รหัสอ้างอิง[:\s]*([A-Za-z0-9]+)/)
  if (!refMatch) return null
  const ref_id = refMatch[1].trim()
  if (ref_id.length < 8) return null

  // ---- account masked: หา xxx-xxx\d{3}-\d ----
  const acctPattern = /[Xx%-]{1,6}-?[Xx%-]{1,4}(\d{3,4})-(\d)/g
  const acctMatches = [...text.matchAll(acctPattern)]
  const from_acct_masked = acctMatches[0]?.[0] || null
  const to_acct_masked   = acctMatches[1]?.[0] || null
  const fromDigits = acctMatches[0]?.[1] || null
  const toDigits   = acctMatches[1]?.[1] || null

  // ---- amount: "จำนวนเงิน" ตามด้วย spaces + ตัวเลข (อยู่บรรทัดเดียวกัน) ----
  const amtMatch = text.match(/จำนวนเงิน\s+([\d,]+\.?\d*)/)
  const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : null

  // ---- memo ----
  const memoMatch = text.match(/บันทึกช่วยจำ[:\s]*\n?([^\n]+)/)
  const memo = memoMatch ? memoMatch[1].trim() : null

  // ---- date: "17 มี.ค. 2569 - 21:03" ----
  let txn_at = null
  const dateMatch = text.match(/(\d{1,2})\s+(\S+\.)\s+(\d{2,4})\s*[-–]\s*(\d{2}:\d{2})/)
  if (dateMatch) {
    const MONTHS = { 'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,
                     'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12 }
    const day   = parseInt(dateMatch[1])
    const month = MONTHS[dateMatch[2]] || 1
    let   year  = parseInt(dateMatch[3])
    if (year > 2400) year = year - 543  // พ.ศ. 4 หลัก → ค.ศ.
    else if (year < 100) year = year - 43 + 2000
    const [hh, mm] = dateMatch[4].split(':').map(Number)
    txn_at = new Date(year, month - 1, day, hh, mm)
  }

  // ---- counterpart_name: บรรทัดหลัง "จาก" ----
  const nameMatch = text.match(/จาก\s+[^\n]*\n\s*([^\n]+)/)
  const counterpart_name = nameMatch ? nameMatch[1].trim() : null

  return {
    ref_id,
    amount,
    fee: null,
    memo,
    txn_at,
    from_digits: fromDigits,
    to_digits:   toDigits,
    from_acct_masked,
    to_acct_masked,
    counterpart_name,
    bank: 'ไทยพาณิชย์',
  }
}

module.exports = { parse }
