/**
 * KBank SMS alert parser — รายการโอนเข้า (income only)
 * Format: "28/04/69 23:26 บช X-4882 รับโอนจาก X-0453 0.10 คงเหลือ 9,692.18 บ."
 */

function parse(text) {
	if (!text) return null
	if (!text.includes('รับโอนจาก')) return null

	const parseNum = (s) => s ? parseFloat(s.replace(/,/g, '')) : null

	// "28/04/69 23:26 บช X-4882 รับโอนจาก X-0453 0.10 คงเหลือ 9,692.18 บ."
	const timeMatch   = text.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/)
	const acctMatch   = text.match(/บช\s+([A-Z\d-]+)/)
	const fromMatch   = text.match(/รับโอนจาก\s+([A-Z\d-]+)\s+([\d,]+\.?\d*)/)
	const balMatch    = text.match(/คงเหลือ\s*([\d,]+\.?\d*)\s*บ\./)

	if (!fromMatch || !acctMatch) return null

	let txnAt = null
	if (timeMatch) {
		const [, dd, mm, yy, hhmm] = timeMatch
		// yy คือ 2 หลักท้ายของปี พ.ศ. → แปลงเป็น ค.ศ.
		const adYear = 1957 + parseInt(yy)
		txnAt = `${adYear}-${mm}-${dd} ${hhmm}:00`
	}

	const acctMasked = acctMatch[1]       // "X-4882"
	const lastDigits = acctMasked.replace(/[A-Z]-?/gi, '').trim()  // "4882"

	const refDate = txnAt ? txnAt.replace(/[-: ]/g, '').substring(0, 12) : Date.now().toString()
	const refId = `SMS-${lastDigits}-${refDate}`

	return {
		raw:              text.trim(),
		ref_id:           refId,
		txn_at:           txnAt,
		amount:           parseNum(fromMatch[2]),
		balance_after:    parseNum(balMatch?.[1]),
		counterpart_name: fromMatch[1] || null,   // "X-0453" (ไม่มีชื่อจริงใน SMS)
		acct_masked:      acctMasked,
		last_digits:      lastDigits,
		fee:              null,
		bank:             'กสิกรไทย',
	}
}

module.exports = { parse }
