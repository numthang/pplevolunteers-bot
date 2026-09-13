/**
 * ไฟล์โอนกลุ่มของรอบจ่ายเบี้ยเลี้ยง — registry ของ formatter
 *
 * ทำไมเป็น registry: ตอนเขียนยังไม่มีสเปกไฟล์ของ K BIZ ในมือ (ต้องโหลด template จากหน้าเว็บธนาคาร)
 * → วันนี้มี CSV กลางที่เปิดด้วย Excel ได้ และใช้เป็นเช็กลิสต์ตอนกดโอนมือใน K PLUS
 * → ได้สเปกเมื่อไหร่ เพิ่มไฟล์ formatter ตัวใหม่ตัวเดียว ไม่ต้องแตะ schema/หน้าจอ
 *
 * ทุก formatter เป็นฟังก์ชัน pure: (round, items, account) → { filename, mime, content }
 * (ทดสอบได้โดยไม่ต้องมี DB — ดู lib/__tests__/payoutExport.test.js)
 */

import { digitsOnly, bankByCode } from '@/config/banks.js'
import { buildGenericCsv } from './genericCsv.js'

export { totalAmount } from './shared.js'

export const FORMATS = [
  {
    id: 'generic-csv',
    label: 'CSV (เปิดด้วย Excel / เช็กลิสต์กดโอนมือ)',
    ext: 'csv',
    mime: 'text/csv; charset=utf-8',
    build: buildGenericCsv,
  },
  // TODO: { id: 'kbiz-txt', … } เมื่อได้ template จากเมนู "ดาวน์โหลดรูปแบบไฟล์" ใน K BIZ
]

export const getFormat = id => FORMATS.find(f => f.id === id) || FORMATS[0]

/** พร้อมเพย์: เบอร์มือถือ 10 หลัก หรือเลขบัตรประชาชน 13 หลัก */
const PROMPTPAY_LENGTHS = [10, 13]

/**
 * ตรวจว่าแต่ละบรรทัดโอนได้จริงไหม — เรียกก่อน build เสมอ
 * คืนรายชื่อคนที่ข้อมูลไม่ครบ เพื่อให้หน้าจอขึ้นธงแดงรายบรรทัดได้ (ไม่ใช่แค่ error รวมก้อนเดียว)
 * @returns {{ ok: boolean, problems: Array<{ id: number, name: string, reason: string }> }}
 */
export function validateItems(items = []) {
  const problems = []

  for (const it of items) {
    const name = (it.payee_name || '').trim() || `#${it.id}`
    const amount = Number(it.amount)

    if (!Number.isFinite(amount) || amount <= 0) {
      problems.push({ id: it.id, name, reason: 'amount' })
      continue
    }
    if (!name || name === `#${it.id}`) {
      problems.push({ id: it.id, name, reason: 'name' })
      continue
    }

    if (it.payment_method === 'promptpay') {
      const pp = digitsOnly(it.promptpay_id)
      if (!PROMPTPAY_LENGTHS.includes(pp.length)) {
        problems.push({ id: it.id, name, reason: 'promptpay' })
      }
    } else {
      const acct = digitsOnly(it.account_no)
      if (!bankByCode(it.bank_code)) problems.push({ id: it.id, name, reason: 'bank_code' })
      else if (acct.length < 6)      problems.push({ id: it.id, name, reason: 'account_no' })
    }
  }

  if (!items.length) problems.push({ id: 0, name: '', reason: 'empty' })

  return { ok: problems.length === 0, problems }
}

export function buildExport(formatId, { round, items, account }) {
  const { ok, problems } = validateItems(items)
  if (!ok) {
    const err = new Error('payout items incomplete')
    err.problems = problems
    throw err
  }
  return getFormat(formatId).build(round, items, account)
}
