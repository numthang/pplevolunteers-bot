/**
 * kbankSlip.js
 * Parse OCR text จากสลิป K-Plus
 */

// normalize Thai ํา (combining) → ำ (precomposed)
function norm(s) {
  return s ? s.replace(/\u0e4d\u0e32/g, '\u0e33').replace(/\u0e4d/g, '') : s
}

function parse(rawText) {
  if (!rawText) return null
  const text = norm(rawText)

  if (!text.includes('เลขที่รายการ')) return null

  // ---- ref_id: บรรทัดหลัง "เลขที่รายการ:" เอาเฉพาะ alphanumeric ต่อเนื่อง ----
  const refMatch = text.match(/เลขที่รายการ[:\s]*\n?\s*([A-Za-z0-9]+)/)
  if (!refMatch) return null
  const ref_id = refMatch[1].trim()

  // ---- account masked: หา pattern *-*-*????-* ทุกตัวในสลิป ----
  // OCR อาจ render x เป็น X, 2, <, %, ๐ ฯลฯ
  // key insight: ทุก masked account ลงท้าย \d{4}-\S เสมอ
  const acctPattern = /\S{1,8}-\S{1,3}-\S{1,3}(\d{4})-\S/g
  const acctMatches = [...text.matchAll(acctPattern)]
  // ตำแหน่งแรก = ผู้โอน (from), ตำแหน่งที่สอง = ผู้รับ (to)
  const from_acct_masked = acctMatches[0]?.[0] || null
  const to_acct_masked   = acctMatches[1]?.[0] || null

  // เอาแค่ 4 digits สุดท้ายของแต่ละบัญชี เพื่อ match กับ DB
  const fromDigits = acctMatches[0]?.[1] || null
  const toDigits   = acctMatches[1]?.[1] || null

  // ---- amount: บรรทัดหลัง "จำนวน:" ----
  const amtMatch = text.match(/จำนวน[:\s]*\n?\s*([\d,]+\.?\d*)\s*บาท/)
  const amount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : null

  // ---- fee ----
  const feeMatch = text.match(/ค่าธรรมเนียม[:\s]*\n?\s*([\d,]+\.?\d*)\s*บาท/)
  const fee = feeMatch ? parseFloat(feeMatch[1].replace(/,/g, '')) : null

  // ---- memo / บันทึกช่วยจำ ----
  const memoMatch = text.match(/บันทึกช่วยจำ[:\s]+(.+)/)
  const memo = memoMatch ? memoMatch[1].trim() : null

  // ---- date: "9 เม.ย. 69 19:09 น." ----
  let txn_at = null
  const dateMatch = text.match(/(\d{1,2})\s+(\S+\.)\s+(\d{2,4})\s+(\d{2}:\d{2})/)
  if (dateMatch) {
    const MONTHS = { 'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,
                     'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12 }
    const day   = parseInt(dateMatch[1])
    const month = MONTHS[dateMatch[2]] || 1
    let   year  = parseInt(dateMatch[3])
    if (year < 100) year = year - 43 + 2000   // พ.ศ. → ค.ศ. (69 - 43 = 26 → 2026)
    const [hh, mm] = dateMatch[4].split(':').map(Number)
    txn_at = new Date(year, month - 1, day, hh, mm)
  }

  // ---- counterpart name: บรรทัดแรกหลัง header ----
  const nameMatch = text.match(/โอนเงินสำเร็จ[^\n]*\n[^\n]+\n([^\n]+)/)
  const counterpart_name = nameMatch ? nameMatch[1].trim() : null

  return {
    ref_id,
    amount,
    fee,
    memo,
    txn_at,
    from_digits:       fromDigits,   // 4 digits สุดท้ายของบัญชีผู้โอน
    to_digits:         toDigits,     // 4 digits สุดท้ายของบัญชีผู้รับ
    from_acct_masked,
    to_acct_masked,
    counterpart_name,
    bank: 'กสิกรไทย',
  }
}

module.exports = { parse }
