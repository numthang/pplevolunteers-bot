// Shared signal config for calling logs and interaction logs
// 3-tier UI mapped to legacy 1-4 score scale (skip 3 to keep tier formula unchanged):
//   น้อย=1, ปานกลาง=2, มาก=4
// hint อธิบาย context เฉพาะของแต่ละ signal

export const SIGNAL_OPTIONS = [
  { value: 4, label: 'มาก' },
  { value: 2, label: 'ปานกลาง' },
  { value: 1, label: 'น้อย' },
]

export const SIGNALS = [
  {
    key: 'sig_location',
    label: 'ที่อยู่',
    hints: { 4: 'ในอำเภอ', 2: 'ในจังหวัด', 1: 'ต่างจังหวัด+' },
  },
  {
    key: 'sig_availability',
    label: 'เวลา',
    hints: { 4: 'ว่างมาก', 2: 'ว่างบ้าง', 1: 'ไม่ค่อยว่าง' },
  },
  {
    key: 'sig_interest',
    label: 'ความสนใจ',
    hints: { 4: 'กระตือรือร้น', 2: 'สนใจ', 1: 'ไม่ค่อยสนใจ' },
  },
]

export function findSignalLabel(signalKey, value) {
  if (!value) return null
  const sig = SIGNALS.find(s => s.key === signalKey)
  return sig?.hints?.[value] || null
}
