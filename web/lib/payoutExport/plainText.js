/**
 * รายการโอนแบบข้อความ — สำหรับ "ส่งต่อให้คนอื่นไปกดโอน" ทาง LINE / Discord
 *
 * ทำไมไม่ใช้ CSV: คนรับงานกดโอนจากมือถือ เปิด Excel ไม่ไหว · ข้อความวางแล้วอ่านได้เลย
 * และก๊อปเลขบัญชีทีละบรรทัดได้ตรงจากแชต
 */

import { digitsOnly, bankByCode } from '@/config/banks.js'
import { totalAmount, chunkIntoGroups, GROUP_SIZE } from './shared.js'

export function buildPlainText(round, items, account) {
  const out = []
  out.push(`${round?.title || 'รอบจ่าย'}`)
  if (account) out.push(`โอนจาก: ${[account.name, account.bank, account.account_no].filter(Boolean).join(' ')}`)
  out.push(`รวม ${items.length} คน · ${totalAmount(items).toLocaleString('th-TH')} บาท`)

  for (const g of chunkIntoGroups(items)) {
    out.push('')
    out.push(`— กลุ่ม ${g.label} (${g.rows.length} คน · ${g.total.toLocaleString('th-TH')} บาท)`)
    g.rows.forEach((it, i) => {
      const isPP = it.payment_method === 'promptpay'
      const dest = isPP
        ? `พร้อมเพย์ ${digitsOnly(it.promptpay_id)}`
        : `${bankByCode(it.bank_code)?.name || '—'} ${digitsOnly(it.account_no)}`
      out.push(`${i + 1}. ${it.payee_name || '—'} · ${dest} · ${Number(it.amount).toLocaleString('th-TH')}`)
    })
  }

  out.push('')
  out.push(`(แอปธนาคารโอนได้ครั้งละ ${GROUP_SIZE} คน — แบ่งกลุ่มไว้ให้แล้ว)`)
  return out.join('\n')
}
