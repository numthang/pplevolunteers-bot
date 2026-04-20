/**
 * KBank SMS alert parser — รายการโอนเข้า (income only)
 * Format: "รายการโอนเข้า 500.00บ. จาก นาย สมชาย เข้าบัญชี x-1234 เมื่อ 19/04/26 17:15น. ยอดเงินคงเหลือ 1,500.00บ."
 */

function parse(text) {
	if (!text) return null
	if (!text.includes('รายการโอนเข้า')) return null

	const parseNum = (s) => s ? parseFloat(s.replace(/,/g, '')) : null

	const amountMatch = text.match(/รายการโอนเข้า\s*([\d,]+\.?\d*)บ\./)
	const nameMatch   = text.match(/จาก\s+(.+?)\s+เข้าบัญชี/)
	const acctMatch   = text.match(/เข้าบัญชี\s+([x\d-]+)/)
	const timeMatch   = text.match(/เมื่อ\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})น\./)
	const balMatch    = text.match(/ยอดเงินคงเหลือ\s*([\d,]+\.?\d*)บ\./)

	if (!amountMatch || !acctMatch) return null

	let txnAt = null
	if (timeMatch) {
		const [, dd, mm, yy, hhmm] = timeMatch
		txnAt = `20${yy}-${mm}-${dd} ${hhmm}:00`
	}

	// "x-1234" → "1234" สำหรับ match กับ account_no ใน DB
	const acctMasked = acctMatch[1]
	const lastDigits = acctMasked.replace(/x|-/gi, '').trim()

	// ref_id สำหรับ dedup — ไม่มี ref จาก KBank ใน SMS เลยใช้ composite key
	const refDate = txnAt ? txnAt.replace(/[-: ]/g, '').substring(0, 12) : Date.now().toString()
	const refId = `SMS-${lastDigits}-${refDate}`

	return {
		raw:              text.trim(),
		ref_id:           refId,
		txn_at:           txnAt,
		amount:           parseNum(amountMatch[1]),
		balance_after:    parseNum(balMatch?.[1]),
		counterpart_name: nameMatch?.[1]?.trim() || null,
		acct_masked:      acctMasked,
		last_digits:      lastDigits,
		fee:              null,
		bank:             'กสิกรไทย',
	}
}

module.exports = { parse }
