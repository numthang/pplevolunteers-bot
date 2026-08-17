/**
 * สีของชิปป้าย — เลือกจากชื่อกลุ่มแบบ deterministic
 *
 * ⛔ ห้าม hardcode ชื่อกลุ่ม ('พื้นที่'/'สายงาน') ที่นี่เด็ดขาด — กลุ่มเป็นข้อมูลที่ org ตั้งเอง
 *    (กติกาเดียวกับหัวไฟล์ web/db/kanban/labels.js) → ใช้ hash ของชื่อเลือกช่องในจาน
 *    ผลลัพธ์: ป้ายในกลุ่มเดียวกันสีเดียวกันเสมอ · org ไหนตั้งกลุ่มชื่ออะไรก็ได้สีทันทีโดยไม่ต้องแก้โค้ด
 *
 * ⚠️ class ต้องเขียนเต็มสตริง — Tailwind สแกน source แบบ static ถ้าต่อ `bg-${c}-100` เอาเองจะไม่มี CSS ออกมา
 */

// พาสเทลจาง-ตัวหนังสือเข้ม แบบ AppFlowy/Notion (ตามภาพที่ user ส่งมา 2026-08-17)
// 12 เฉด — พอให้ป้าย 29 อันไม่ซ้ำกันจนแยกไม่ออกในสายตา แต่ไม่เยอะจนดูมั่ว
// dark: พื้นเข้มหม่น + ตัวหนังสือจางของเฉดเดียวกัน (พาสเทลจางบนพื้นดำ = แสบตา อ่านไม่ออก)
const CHIP_PALETTE = [
  'bg-[#F3E5F5] text-[#6A1B9A] dark:bg-[#4A2E52]/60 dark:text-[#E1BEE7]',  // ม่วง
  'bg-[#FCE4EC] text-[#AD1457] dark:bg-[#52293A]/60 dark:text-[#F8BBD0]',  // ชมพู
  'bg-[#FFEBEE] text-[#C62828] dark:bg-[#532B2B]/60 dark:text-[#FFCDD2]',  // แดง
  'bg-[#FFF3E0] text-[#E65100] dark:bg-[#4F3520]/60 dark:text-[#FFE0B2]',  // ส้ม
  'bg-[#FFF8E1] text-[#F57F17] dark:bg-[#4C4020]/60 dark:text-[#FFF59D]',  // เหลือง
  'bg-[#F1F8E9] text-[#558B2F] dark:bg-[#33461F]/60 dark:text-[#DCEDC8]',  // เขียวอ่อน
  'bg-[#E8F5E9] text-[#2E7D32] dark:bg-[#24452A]/60 dark:text-[#C8E6C9]',  // เขียว
  'bg-[#E0F2F1] text-[#00695C] dark:bg-[#1E4541]/60 dark:text-[#B2DFDB]',  // เขียวน้ำทะเล
  'bg-[#E0F7FA] text-[#00838F] dark:bg-[#1D454B]/60 dark:text-[#B2EBF2]',  // ฟ้าอมเขียว
  'bg-[#E3F2FD] text-[#1565C0] dark:bg-[#1E3A52]/60 dark:text-[#BBDEFB]',  // ฟ้า
  'bg-[#E8EAF6] text-[#283593] dark:bg-[#2A2F52]/60 dark:text-[#C5CAE9]',  // น้ำเงิน
  'bg-[#EFEBE9] text-[#5D4037] dark:bg-[#43352F]/60 dark:text-[#D7CCC8]',  // น้ำตาล
]

// ป้ายที่ไม่มีกลุ่ม — สีกลางๆ ไม่แย่งสายตากับกลุ่มที่ตั้งใจแยกสี
const NO_GROUP_CHIP = 'bg-warm-100 text-warm-700 dark:bg-white/10 dark:text-disc-text'

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * class ของชิป 1 ใบ — ป้ายที่ตั้งสีเองใน DB ชนะเสมอ (color เก็บเป็น class เต็มสตริง)
 *
 * ⭐ สีผูกกับ **ชื่อป้าย** ไม่ใช่ชื่อกลุ่ม (เปลี่ยน 2026-08-17 ตามภาพตัวอย่างที่ user ส่งมา)
 *    รอบแรกทำสีต่อกลุ่ม — อ่านกลุ่มง่ายก็จริง แต่บนกระดานที่ไม่โชว์ชื่อกลุ่ม
 *    ป้ายทั้งกองกลายเป็นสีเดียวกันหมด แยกไม่ออกว่าใบไหนคือใบไหน
 *    ใส่ชื่อกลุ่มเป็นเกลือด้วย — ชื่อป้ายซ้ำข้ามกลุ่มจะได้ไม่ได้สีเดียวกันโดยบังเอิญ
 */
export function chipClass(label) {
  if (label?.color) return label.color
  const name = label?.name
  if (!name) return NO_GROUP_CHIP
  const group = label?.group ?? label?.group_name ?? ''
  return CHIP_PALETTE[hash(`${group}/${name}`) % CHIP_PALETTE.length]
}

/**
 * ป้ายของการ์ด → เรียงเป็นกลุ่มให้ UI วาดทีละกอง (ดีไซน์: ห้ามกองรวมเป็นพรืดเดียว)
 * รับ shape ที่ cards.js คืนมา ({ id, name, group, color })
 * @returns {{ group: string|null, labels: object[] }[]}
 */
export function groupCardLabels(labels = []) {
  const byGroup = new Map()
  for (const l of labels) {
    const key = l.group ?? l.group_name ?? ''
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(l)
  }
  return [...byGroup.entries()].map(([group, list]) => ({ group: group || null, labels: list }))
}
