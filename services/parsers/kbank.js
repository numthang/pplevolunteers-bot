/**
 * KBank email notification parser
 * รองรับ email แจ้งเตือนการโอนเงิน KBank (K+)
 */

/**
 * @param {string} text - plain text body of email
 * @returns {object|null} parsed transaction data or null if not recognized
 */
function parse(text) {
  if (!text) return null

  // ตรวจว่าเป็น email KBank
  if (!text.includes('เลขที่รายการ') || !text.includes('จำนวนเงิน (บาท)')) return null

  const get = (label) => {
    const match = text.match(new RegExp(`${label}\\s*:\\s*(.+)`))
    return match ? match[1].trim() : null
  }

  const dateStr    = get('วันที่ทำรายการ')   // "08/04/2026  20:50:38"
  const refId      = get('เลขที่รายการ')
  // transfer: "โอนเงินจากบัญชี", credit card payment: "ชำระเงินจากบัญชี"
  const fromAcct   = get('โอนเงินจากบัญชี') || get('ชำระเงินจากบัญชี')
  const toBank     = get('ธนาคารผู้รับเงิน')
  const toAcct     = get('เพื่อเข้าบัญชี')
  const toName     = get('ชื่อบัญชี') || get('เพื่อเข้าบัญชีบริษัท')
  const creditCard = get('เลขบัตรเครดิต')
  const amountStr  = get('จำนวนเงิน \\(บาท\\)')
  const feeStr     = get('ค่าธรรมเนียม \\(บาท\\)')
  const balStr     = get('ยอดถอนได้ \\(บาท\\)')

  if (!refId || !amountStr) return null

  const parseNum = (s) => s ? parseFloat(s.replace(/,/g, '')) : null

  // แปลงวันที่ "08/04/2026  20:50:38" → Date
  let txnAt = null
  if (dateStr) {
    const m = dateStr.trim().match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}:\d{2})/)
    if (m) txnAt = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}`)
  }

  return {
    ref_id:             refId,
    txn_at:             txnAt,
    amount:             parseNum(amountStr),
    fee:                parseNum(feeStr),
    balance_after:      parseNum(balStr),
    from_acct_masked:   fromAcct,   // ใช้ match กับบัญชีใน DB (last digits)
    counterpart_name:   toName,
    counterpart_account: toAcct ? toAcct.replace(/-/g, '') : null,
    counterpart_bank:   toBank,
    bank: 'กสิกรไทย',
  }
}

module.exports = { parse }
