/**
 * KBank SMS alert parser
 * Format 1 (income): "28/04/69 23:26 บช X-4882 รับโอนจาก X-0453 0.10 คงเหลือ 9,692.18 บ."
 * Format 2 (income): "06/05/69 19:08 บช X-4882 เงินเข้า 10,000.00 คงเหลือ 17,922.78 บ."
 * Format 3 (expense): "12/05/69 23:07 บช X-4882 เงินออก 1,605.00 คงเหลือ 4,671.78 บ."
 */

function parse(text) {
	if (!text) return null

	const isTransfer = text.includes('รับโอนจาก')
	const isDeposit  = text.includes('เงินเข้า')
	const isExpense  = text.includes('เงินออก')
	if (!isTransfer && !isDeposit && !isExpense) return null

	const type = isExpense ? 'expense' : 'income'

	const parseNum = (s) => s ? parseFloat(s.replace(/,/g, '')) : null

	const timeMatch = text.match(/(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/)
	const acctMatch = text.match(/บช\s+([A-Z\d-]+)/)
	const balMatch  = text.match(/คงเหลือ\s*([\d,]+\.?\d*)\s*บ\./)

	if (!acctMatch) return null

	const fromMatch    = isTransfer ? text.match(/รับโอนจาก\s+([A-Z\d-]+)\s+([\d,]+\.?\d*)/) : null
	const depositMatch = isDeposit  ? text.match(/เงินเข้า\s+([\d,]+\.?\d*)/) : null
	const expenseMatch = isExpense  ? text.match(/เงินออก\s+([\d,]+\.?\d*)/) : null

	if (!fromMatch && !depositMatch && !expenseMatch) return null

	let txnAt = null
	if (timeMatch) {
		const [, dd, mm, yy, hhmm] = timeMatch
		const adYear = 1957 + parseInt(yy)
		txnAt = `${adYear}-${mm}-${dd} ${hhmm}:00`
	}

	const acctMasked = acctMatch[1]
	const lastDigits = acctMasked.replace(/[A-Z]-?/gi, '').trim()

	const refDate = txnAt ? txnAt.replace(/[-: ]/g, '').substring(0, 12) : Date.now().toString()
	const refId = isExpense ? `SMS-EXP-${lastDigits}-${refDate}` : `SMS-${lastDigits}-${refDate}`

	const amount = fromMatch ? parseNum(fromMatch[2])
	             : depositMatch ? parseNum(depositMatch[1])
	             : parseNum(expenseMatch[1])
	const counterpartName = fromMatch ? (fromMatch[1] || null) : null

	return {
		type,
		raw:              text.trim(),
		ref_id:           refId,
		txn_at:           txnAt,
		amount,
		balance_after:    parseNum(balMatch?.[1]),
		counterpart_name: counterpartName,
		acct_masked:      acctMasked,
		last_digits:      lastDigits,
		fee:              null,
		bank:             'กสิกรไทย',
	}
}

module.exports = { parse }
