/**
 * สีของชิปป้าย — เลือกจากชื่อกลุ่มแบบ deterministic
 *
 * ⛔ ห้าม hardcode ชื่อกลุ่ม ('พื้นที่'/'สายงาน') ที่นี่เด็ดขาด — กลุ่มเป็นข้อมูลที่ org ตั้งเอง
 *    (กติกาเดียวกับหัวไฟล์ web/db/kanban/labels.js) → ใช้ hash ของชื่อเลือกช่องในจาน
 *    ผลลัพธ์: ป้ายในกลุ่มเดียวกันสีเดียวกันเสมอ · org ไหนตั้งกลุ่มชื่ออะไรก็ได้สีทันทีโดยไม่ต้องแก้โค้ด
 *
 * ⚠️ class ต้องเขียนเต็มสตริง — Tailwind สแกน source แบบ static ถ้าต่อ `bg-${c}-100` เอาเองจะไม่มี CSS ออกมา
 */

const CHIP_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
]

// ป้ายที่ไม่มีกลุ่ม — สีกลางๆ ไม่แย่งสายตากับกลุ่มที่ตั้งใจแยกสี
const NO_GROUP_CHIP = 'bg-warm-100 text-warm-700 dark:bg-white/10 dark:text-disc-text'

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** class ของชิป 1 ใบ — ป้ายที่ตั้งสีเองใน DB ชนะเสมอ (color เก็บเป็น class เต็มสตริง) */
export function chipClass(label) {
  if (label?.color) return label.color
  const group = label?.group ?? label?.group_name
  if (!group) return NO_GROUP_CHIP
  return CHIP_PALETTE[hash(String(group)) % CHIP_PALETTE.length]
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
