/**
 * ธนาคาร — รหัส 3 หลักตามมาตรฐาน ธปท. + ชื่อไทย + สีสำหรับ badge
 *
 * ทำไมต้องมีรหัส: ไฟล์โอนกลุ่มของธนาคาร (K BIZ bulk transfer) อ้างธนาคารด้วย "รหัส" ไม่ใช่ชื่อ
 * ส่วนชื่อไทยที่คนกรอกเองสะกดกันคนละแบบ — prod เคยมี "กสิรกรไทย" (พิมพ์ผิด) ปนอยู่จริง
 *
 * ⚠️ ตารางนี้ย้ายมาจาก components/BankBadge.jsx — BankBadge อ่านจากที่นี่แล้ว อย่าเพิ่มซ้ำสองที่
 * ⚠️ แถวเก่าใน DB เก็บแต่ชื่อไทย (bank_name) → ใช้ bankByName() หาโค้ดให้
 */

export const BANKS = [
  { code: '002', name: 'กรุงเทพ',          abbr: 'BBL',  bg: '#1e3a7b', text: '#fff' },
  { code: '004', name: 'กสิกรไทย',         abbr: 'K',    bg: '#00b050', text: '#fff' },
  { code: '006', name: 'กรุงไทย',          abbr: 'KTB',  bg: '#00aeef', text: '#fff' },
  { code: '011', name: 'ทหารไทยธนชาต',    abbr: 'TTB',  bg: '#0066b3', text: '#fff' },
  { code: '014', name: 'ไทยพาณิชย์',       abbr: 'SCB',  bg: '#4e2d8f', text: '#fff' },
  { code: '017', name: 'ซิตี้แบงก์',        abbr: 'CITI', bg: '#004685', text: '#fff' },
  { code: '020', name: 'สแตนดาร์ดชาร์เตอร์ด', abbr: 'SCBT', bg: '#0473ea', text: '#fff' },
  { code: '022', name: 'ซีไอเอ็มบี ไทย',    abbr: 'CIMB', bg: '#7e2f35', text: '#fff' },
  { code: '024', name: 'ยูโอบี',            abbr: 'UOB',  bg: '#0b3979', text: '#fff' },
  { code: '025', name: 'กรุงศรีอยุธยา',     abbr: 'BAY',  bg: '#fdb827', text: '#000' },
  { code: '030', name: 'ออมสิน',            abbr: 'GSB',  bg: '#e40078', text: '#fff' },
  { code: '033', name: 'อาคารสงเคราะห์',   abbr: 'GHB',  bg: '#f57d20', text: '#fff' },
  { code: '034', name: 'ธ.ก.ส.',            abbr: 'BAAC', bg: '#006633', text: '#fff' },
  { code: '066', name: 'อิสลามแห่งประเทศไทย', abbr: 'IBANK', bg: '#184e3f', text: '#fff' },
  { code: '067', name: 'ทิสโก้',            abbr: 'TSCO', bg: '#12549f', text: '#fff' },
  { code: '069', name: 'เกียรตินาคินภัทร',  abbr: 'KKP',  bg: '#635ba7', text: '#fff' },
  { code: '071', name: 'ไทยเครดิต',         abbr: 'TCD',  bg: '#f2b62d', text: '#000' },
  { code: '073', name: 'แลนด์ แอนด์ เฮ้าส์', abbr: 'LHB',  bg: '#6d6e71', text: '#fff' },
  { code: '098', name: 'พัฒนาวิสาหกิจฯ',    abbr: 'SME',  bg: '#0b4d8f', text: '#fff' },
]

/** ชื่ออื่นที่คนกรอกกันจริงในระบบ → ชื่อหลัก (รวมคำสะกดผิดที่เจอใน prod) */
const NAME_ALIASES = {
  'กสิรกรไทย': 'กสิกรไทย',
  'กสิกร': 'กสิกรไทย',
  'ไทยพานิชย์': 'ไทยพาณิชย์',
  'กรุงศรี': 'กรุงศรีอยุธยา',
  'ทหารไทย': 'ทหารไทยธนชาต',
  'ธนชาต': 'ทหารไทยธนชาต',
  'ธกส': 'ธ.ก.ส.',
}

const BY_CODE = new Map(BANKS.map(b => [b.code, b]))
const BY_NAME = new Map(BANKS.map(b => [b.name, b]))

export const bankByCode = code => BY_CODE.get(String(code || '').padStart(3, '0')) || null

export const bankByName = name => {
  const key = String(name || '').trim()
  return BY_NAME.get(NAME_ALIASES[key] || key) || null
}

/** หาจากอะไรก็ได้ที่มีติดแถวมา — ใช้ตอนแสดงผลแถวเก่าที่มีแต่ชื่อ */
export const resolveBank = ({ bank_code, bank_name, bank } = {}) =>
  bankByCode(bank_code) || bankByName(bank_name || bank)

/** เลขบัญชี/พร้อมเพย์เก็บเป็นตัวเลขล้วนเสมอ — ขีดกับเว้นวรรคทำไฟล์โอนพัง */
export const digitsOnly = v => String(v ?? '').replace(/\D/g, '')
