/**
 * ปุ่ม — ชั้น primitive ของ design system
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ ไฟล์นี้คือ **ที่เดียว** ที่รู้ว่าปุ่มหน้าตายังไง · กฎมาจาก md/rules/DESIGN.md §Primary button
 *    และ md/rules/DESIGN.md — ห้ามลอกคลาสไปเขียนซ้ำในหน้าอื่น ให้ import ตัวนี้ไป
 *
 * ทำไมต้องมี (วัดจริง 2026-09-19): ในโปรเจกต์มี <button> 714 ตัว แต่คลาส "rounded + px" ไม่ซ้ำกัน
 * ถึง 92 แบบ · กฎที่เขียนไว้ว่า "ปุ่มมีขนาดเดียว px-4 py-2 text-base" ถูกละเมิด 51 จุด
 * เพราะทุกไฟล์ประกาศ const BTN ของตัวเอง (พบ 34 ครั้งใน 8 ไฟล์) แล้วค่อยๆ เพี้ยนออกจากกัน
 *
 * ⚠️ ไม่มี 'use client' โดยตั้งใจ — ตัวมันเองไม่มี state/hook · ไฟล์ที่เป็น client อยู่แล้ว
 *    import ไปใช้ได้ตามปกติ (onClick ส่งเข้ามาจากฝั่ง client) · ถ้าใส่ 'use client' ที่นี่
 *    จะลาก component นี้เข้า bundle ฝั่ง client ทุกหน้าที่เรียก แม้หน้านั้นเป็น server component
 */

const BASE = 'rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed'

const SIZE = {
  // ขนาดเดียวของทั้งโปรเจกต์ (md/rules/DESIGN.md §Type scale)
  md: 'px-4 py-2 text-base',
  // ⛔ ข้อยกเว้นเดียวที่อนุญาต: ปุ่มบนการ์ด /kanban (เคาะ 2026-09-02) — การ์ดแคบและมีปุ่มได้หลายอัน
  //    ปุ่มมาตรฐานดันการ์ดสูงเกินไป · **ห้ามใช้นอกการ์ด kanban**
  sm: 'px-3 py-1.5 text-sm',
}

const VARIANT = {
  primary:   'bg-teal hover:opacity-90 text-white',
  secondary: 'border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }) {
  return (
    <button className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

/**
 * แถวปุ่ม — มือถือเต็มความกว้างเรียงลง · จอกว้างกลับเป็นแถวปกติ (md/rules/DESIGN.md §8)
 *
 * ⛔ ห้ามใช้ `flex flex-wrap` เฉยๆ กับแถวปุ่มข้อความ — ได้ปุ่มกว้างไม่เท่ากัน ขอบขวาแหว่ง
 *    ปุ่มสุดท้ายค้างครึ่งแถว · `mobileAudit` จับเคสนี้ด้วยกฎ **ragged**
 * ⭐ ใช้ grid เพราะลูกของ grid ยืดเต็มคอลัมน์เอง — ไม่ต้องไปเติม w-full ที่ปุ่มทุกตัว
 *    (ปุ่มพวกนี้ถูกใช้ร่วมกับโมดัลด้วย แก้ที่คลาสปุ่ม = พังอีกที่)
 *
 * cols={2} ใช้ได้เฉพาะปุ่มข้อความสั้นจริง ≤8 ตัวอักษร (ยืนยัน/ยกเลิก)
 */
export function ButtonRow({ cols = 1, className = '', children }) {
  return (
    <div className={`grid ${cols === 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-2 sm:flex sm:flex-wrap ${className}`}>
      {children}
    </div>
  )
}

const ICON_SIZE = {
  card:  'h-8 w-8',   // ปุ่มลอยมุมขวาบนของการ์ด (ไอคอน 16)
  row:   'h-9 w-9',   // ปุ่มไอคอนในแถว/ทูลบาร์  (ไอคอน 16)
  modal: 'h-9 w-9',   // ปุ่มปิดโมดัล            (ไอคอน 20)
}

const ICON_TONE = {
  default: 'text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover',
  // ปุ่มทำลาย: เทาก่อน → แดงตอน hover เท่านั้น (md/rules/DESIGN.md §3)
  // ⛔ ห้ามแดงตั้งแต่ยังไม่แตะ — การ์ด 20 ใบเป็นถังขยะแดง 20 อัน = หน้าจอที่ตะโกนใส่คนใช้
  danger:  'text-warm-400 dark:text-disc-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover',
}

/**
 * ปุ่มไอคอน (md/rules/DESIGN.md §4)
 * - `shrink-0` ติดมาให้แล้ว — ปุ่มไอคอนในแถว flex ที่ไม่มีคลาสนี้จะโดนบีบจนไม่เป็นสี่เหลี่ยม
 * - **ต้องส่ง aria-label เสมอ** ไม่มีข้อความกำกับ = คนใหม่เดาไม่ออก + screen reader อ่านไม่ได้
 *   ถ้าไม่ส่ง title มา จะใช้ aria-label เป็น title ให้เอง (tooltip บนเดสก์ท็อป)
 */
export function IconButton({ size = 'row', tone = 'default', className = '', children, ...rest }) {
  if (process.env.NODE_ENV !== 'production' && !rest['aria-label']) {
    console.warn('[ui/IconButton] ขาด aria-label — ปุ่มไอคอนทุกตัวต้องมี (md/rules/DESIGN.md §4)')
  }
  return (
    <button
      title={rest.title ?? rest['aria-label']}
      className={`${ICON_SIZE[size]} shrink-0 flex items-center justify-center rounded-lg transition ${ICON_TONE[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
