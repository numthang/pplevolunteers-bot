/**
 * สีของชิปป้าย + หัวช่องกระดาน
 *
 * ⛔ **ห้ามคิดเฉดสีขึ้นเอง** — user มีคลังสีพาสเทลตั้งชื่อไว้ 21 ชุด ชุดละ 5 hex ให้หยิบจากที่นั่นเสมอ
 *    (เคยพลาดมาแล้ว 2026-08-17: ไปหยิบโทน AppFlowy/Material มาใช้ user ทักว่า "เดาสุ่มหรือเปล่า")
 *    โซน kanban ใช้ 3 ชุดผสมกัน — เทา · ชมพูอ่อน · ม่วง (user เคาะ 2026-08-17)
 *
 * ⛔ ห้าม hardcode ชื่อกลุ่มป้าย ('พื้นที่'/'สายงาน') — กลุ่มเป็นข้อมูลที่ org ตั้งเอง
 *
 * วิธีลงสี: ส่ง hex เดียวเข้า CSS var `--kb` แล้วให้ `.kb-tint` ใน globals.css ผสมเอง
 * (พื้น = ผสม card-bg · ตัวอักษร = ผสมดำ/ขาว) → ได้ทั้ง light/dark จาก hex ชุดเดียว
 * ข้อดีอีกอย่าง: ไม่ต้องพึ่ง Tailwind scan คลาสสีอีก (เคยพลาดเพราะ lib/ ไม่ได้อยู่ใน content — bug-409)
 */

// เทา · ชมพูอ่อน · ม่วง — คัดเอาเฉดที่แยกกันออกด้วยตาเปล่า (ตัดเทาซ้ำกับฟ้าจางเกือบขาวทิ้ง)
const CHIP_PALETTE = [
  '#CAE7E3', // เทา — มิ้นต์
  '#EEB8C5', // เทา — ชมพูนวล
  '#FEC7BB', // เทา — ส้มพีช
  '#BBEAA6', // ชมพูอ่อน — เขียวอ่อน
  '#E3C878', // ชมพูอ่อน — เหลืองอำพัน
  '#ED9A73', // ชมพูอ่อน — ส้ม
  '#E688A1', // ชมพูอ่อน — ชมพูเข้ม
  '#F14668', // ชมพูอ่อน — แดง
  '#84A6D6', // ม่วง — ฟ้าหม่น
  '#4382BB', // ม่วง — น้ำเงิน
  '#E4CEE0', // ม่วง — ม่วงนวล
  '#A15D98', // ม่วง — ม่วงเข้ม
]

// ป้ายที่ไม่มีกลุ่ม — เทากลางๆ ของชุด "เทา" ไม่แย่งสายตากับกลุ่มที่ตั้งใจแยกสี
const NO_GROUP_COLOR = '#DCDBD9'

/** หัวช่องกระดาน — จับคู่ตามความหมายของสถานะ ไม่ใช่ไล่ตามลำดับในจาน */
export const STATUS_COLOR = {
  backlog:   '#DCDBD9', // เทา — ยังไม่เริ่ม
  doing:     '#84A6D6', // ฟ้า — กำลังเดิน
  review:    '#E3C878', // เหลือง — รอคนตรวจ
  ready:     '#A15D98', // ม่วง — ผ่านแล้วรอคิว
  done:      '#BBEAA6', // เขียว — จบ
  cancelled: '#B2B2B2', // เทาเข้ม — ยกเลิก
}

function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/**
 * props ของชิป 1 ใบ — ใช้เป็น {...chipProps(l)} บน element ได้เลย
 *
 * ⭐ สีผูกกับ **ชื่อป้าย** ไม่ใช่ชื่อกลุ่ม (ตามภาพตัวอย่างที่ user ส่งมา: กลุ่มเดียวกันคนละสี)
 *    ใส่ชื่อกลุ่มเป็นเกลือด้วย — ชื่อป้ายซ้ำข้ามกลุ่มจะได้ไม่ได้สีเดียวกันโดยบังเอิญ
 */
export function chipProps(label) {
  const name = label?.name
  const group = label?.group ?? label?.group_name ?? ''
  // ป้ายที่ตั้งสีเองใน DB ชนะเสมอ (เก็บเป็น hex ตัวเดียว ไม่ใช่คลาส)
  const color = label?.color
    || (name ? CHIP_PALETTE[hash(`${group}/${name}`) % CHIP_PALETTE.length] : NO_GROUP_COLOR)
  return { className: 'kb-tint', style: { '--kb': color } }
}

/** props ของหัวช่องบนกระดาน (เข้มกว่าชิปนิดนึง) */
export function columnHeadProps(status) {
  return { className: 'kb-tint-strong', style: { '--kb': STATUS_COLOR[status] || NO_GROUP_COLOR } }
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
