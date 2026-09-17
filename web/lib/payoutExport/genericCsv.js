/**
 * CSV กลาง — เปิดด้วย Excel ได้ตรงๆ และใช้เป็นเช็กลิสต์ตอนกดโอนมือใน K PLUS
 *
 * แบ่งกลุ่มละ 10 ให้ในคอลัมน์แรก — ตรงกับเพดานของแอปธนาคาร คนกดโอนไล่ทีละกลุ่มได้เลย
 *
 * ⚠️ ต้องมี BOM (﻿) นำหน้า ไม่งั้น Excel บน Windows อ่านภาษาไทยเป็นขยะ
 * ⚠️ เลขบัญชีครอบด้วย ="…" ไม่งั้น Excel ตัดศูนย์หน้าทิ้ง (0891234567 → 891234567)
 */

import { digitsOnly, bankByCode } from '@/config/banks.js'
import { totalAmount, groupLabel, GROUP_SIZE } from './shared.js'

const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
const excelText = v => `="${String(v ?? '')}"`

const pad2 = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`

const HEAD = ['กลุ่ม', 'ลำดับ', 'ชื่อผู้รับ', 'เบอร์โทร', 'วิธีรับเงิน', 'ธนาคาร', 'รหัสธนาคาร', 'เลขบัญชี/พร้อมเพย์', 'จำนวนเงิน', 'หมายเหตุ']

export function buildGenericCsv(round, items, account) {
  const now = new Date()
  const lines = []

  // ── สรุปหัวไฟล์ (ตรงกับ header ของไฟล์โอนกลุ่มธนาคาร: ใครโอน วันไหน กี่รายการ รวมเท่าไหร่)
  lines.push([esc('รอบจ่าย'), esc(round?.title)].join(','))
  lines.push([esc('บัญชีต้นทาง'), esc([account?.name, account?.bank, account?.account_no].filter(Boolean).join(' '))].join(','))
  lines.push([esc('วันที่ออกไฟล์'), esc(ymd(now))].join(','))
  lines.push([esc('จำนวนรายการ'), items.length].join(','))
  lines.push([esc('จำนวนกลุ่ม'), Math.ceil(items.length / GROUP_SIZE)].join(','))
  lines.push([esc('ยอดรวม'), totalAmount(items).toFixed(2)].join(','))
  lines.push('')

  lines.push(HEAD.map(esc).join(','))

  items.forEach((it, i) => {
    const isPP = it.payment_method === 'promptpay'
    const bank = isPP ? null : bankByCode(it.bank_code)
    lines.push([
      esc(groupLabel(i)),
      i + 1,
      esc(it.payee_name),
      it.phone ? excelText(digitsOnly(it.phone)) : esc(''),
      esc(isPP ? 'พร้อมเพย์' : 'บัญชีธนาคาร'),
      esc(bank?.name || ''),
      esc(bank?.code || ''),
      excelText(digitsOnly(isPP ? it.promptpay_id : it.account_no)),
      Number(it.amount).toFixed(2),
      esc(it.note),
    ].join(','))
  })

  return {
    filename: `payout-${round?.id ?? 'draft'}-${ymd(now)}.csv`,
    mime: 'text/csv; charset=utf-8',
    content: '﻿' + lines.join('\r\n') + '\r\n',
  }
}
