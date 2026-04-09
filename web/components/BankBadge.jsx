const BANKS = {
  'กสิกรไทย':        { abbr: 'K',    bg: '#00b050', text: '#fff' },
  'ไทยพาณิชย์':      { abbr: 'SCB',  bg: '#4e2d8f', text: '#fff' },
  'กรุงเทพ':         { abbr: 'BBL',  bg: '#1e3a7b', text: '#fff' },
  'กรุงไทย':         { abbr: 'KTB',  bg: '#00aeef', text: '#fff' },
  'กรุงศรีอยุธยา':   { abbr: 'BAY',  bg: '#fdb827', text: '#000' },
  'ทหารไทยธนชาต':   { abbr: 'TTB',  bg: '#0066b3', text: '#fff' },
  'ออมสิน':          { abbr: 'GSB',  bg: '#e40078', text: '#fff' },
  'ธ.ก.ส.':          { abbr: 'BAAC', bg: '#006633', text: '#fff' },
  'PayPal':           { abbr: 'PP',   bg: '#003087', text: '#fff' },
  'เงินสด':          { abbr: '฿',    bg: '#6b7280', text: '#fff' },
}

export default function BankBadge({ bank, size = 32 }) {
  const info = BANKS[bank] || (bank == null ? BANKS['เงินสด'] : null)
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
