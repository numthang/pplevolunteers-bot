/**
 * kbankSlip.js
 * Parse OCR text จากสลิป K-Plus (โอนเงิน + จ่ายบิล)
 */

// normalize Thai ํา (combining) → ำ (precomposed)
function norm(s) {
  return s ? s.replace(/\u0e4d\u0e32/g, '\u0e33').replace(/\u0e4d/g, '') : s
}

function parse(rawText) {
  if (!rawText) return null
  const text = norm(rawText)

  if (!text.includes('เลขที่รายการ')) return null

  // ---- ref_id: หา alphanumeric ที่ยาวที่สุดในช่วง 200 ตัวอักษรหลัง "เลขที่รายการ" ----
  // OCR อาจใส่ขยะ หรืออ่าน "จำนวน" ไม่ออกเลย (พื้นหลังสีหรือลายน้ำ)
  const refIdx = text.indexOf('เลขที่รายการ')
  if (refIdx < 0) return null
  const refWindow = text.slice(refIdx, refIdx + 200)
  const refCandidates = (refWindow.match(/[A-Za-z0-9]+/g) || [])
    .filter(s => !/^เลขที่รายการ/.test(s))  // ตัด label ออก
  const ref_id = refCandidates.sort((a, b) => b.length - a.length)[0]
  if (!ref_id || ref_id.length < 8) return null

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

  // ---- amount ----
  // primary: หลัง "จำนวน:" (รองรับ noise และ dot-thousands)
  // fallback: หา x,xxx.xx บาท ทุกที่ใน text แล้วเอาค่าสูงสุดที่ > 0 (ตัด 0.00 ค่าธรรมเนียมออก)
  function parseMoney(raw) {
    const dots = (raw.match(/\./g) || []).length
    if (dots > 1) {
      const lastDot = raw.lastIndexOf('.')
      raw = raw.slice(0, lastDot).replace(/\./g, '') + raw.slice(lastDot)
    }
    return parseFloat(raw.replace(/,/g, '')) || null
  }

  let amount = null
  const amtMatch = text.match(/จำนวน[^\n]{0,60}\n[\s\S]{0,80}?([\d,.]+)\s*บ[าา]?ท/)
  if (amtMatch) amount = parseMoney(amtMatch[1])

  if (!amount) {
    // fallback: หาทุก "x,xxx.xx บาท" แล้วเอาค่าสูงสุด
    const all = [...text.matchAll(/([\d,]+\.\d{2})\s*บ[าา]?ท/g)]
      .map(m => parseMoney(m[1]))
      .filter(n => n && n > 0)
    if (all.length) amount = Math.max(...all)
  }

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

  // ---- counterpart_name: ชื่อบรรทัดแรกหลัง from_acct ----
  // (ไม่ใช้ header เพราะจะดึงชื่อบัญชีตัวเอง)
  let counterpart_name = null
  if (from_acct_masked) {
    const idx = text.indexOf(from_acct_masked)
    if (idx >= 0) {
      const rest = text.slice(idx + from_acct_masked.length)
      const nm = rest.match(/\n+([^\n]+)/)
      if (nm) {
        counterpart_name = nm[1].trim()
          .replace(/\s+[A-Za-z]$/, '')  // ตัด OCR noise ท้าย เช่น "Payment to Shopee i" → "Payment to Shopee"
          .trim() || null
      }
    }
  }

  return {
    ref_id,
    amount,
    fee,
    memo,
    txn_at,
    from_digits:       fromDigits,
    to_digits:         toDigits,
    from_acct_masked,
    to_acct_masked,
    counterpart_name,
    bank: 'กสิกรไทย',
  }
}

module.exports = { parse }
