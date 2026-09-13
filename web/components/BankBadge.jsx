import { resolveBank } from '@/config/banks.js'

// รายการที่ไม่ใช่ธนาคารจริง (ไม่มีรหัส ธปท.) — ใช้แสดงผลอย่างเดียว โอนกลุ่มไม่ได้
const EXTRA = {
  'PayPal': { abbr: 'PP', bg: '#003087', text: '#fff' },
  'เงินสด': { abbr: '฿',  bg: '#6b7280', text: '#fff' },
}

export default function BankBadge({ bank, bankCode, size = 32 }) {
  const info = resolveBank({ bank_code: bankCode, bank_name: bank })
    || EXTRA[bank]
    || (bank == null && bankCode == null ? EXTRA['เงินสด'] : null)
  if (!info) return null

  const fontSize = size <= 28 ? 9 : size <= 36 ? 10 : 12

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: info.bg,
        color: info.text,
        fontSize,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        letterSpacing: '-0.03em',
      }}
    >
      {info.abbr}
    </div>
  )
}
