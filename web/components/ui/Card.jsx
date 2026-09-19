/**
 * การ์ด / แถวรายการ — ชั้น primitive ของ design system
 * กฎมาจาก md/rules/DESIGN.md §Card และกายวิภาคใน md/rules/DESIGN.md §1
 *
 * ⛔ การ์ดทั้งโปรเจกต์เป็น `rounded-lg` — ห้าม `rounded-xl`
 *    (วัด 2026-09-19: rounded-xl หลุดอยู่ 160 จุด ส่วน rounded-lg 664 จุด)
 *
 * กายวิภาคที่ต้องเรียงตามนี้เสมอ (DESIGN.md §1):
 *   บรรทัด 1  ชื่อเรื่องอย่างเดียว (truncate) — ปุ่มลบลอย absolute ทับมุมขวาบน ไม่กินความกว้าง
 *   บรรทัด 2  ที่มา · เจ้าของ · จังหวัด
 *   บรรทัด 3  ยอด · จำนวน · เวลา **+ ป้ายสถานะต่อท้ายบรรทัดเดียวกัน**
 */

export default function Card({ hover = false, relative = true, className = '', children, ...rest }) {
  return (
    <div
      className={
        'rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg ' +
        `${relative ? 'group relative ' : ''}` +
        `${hover ? 'hover:bg-warm-50 dark:hover:bg-disc-hover transition-colors ' : ''}` +
        className
      }
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * ชื่อเรื่องของการ์ด — บรรทัดที่ 1
 * `pr-10` เผื่อที่ให้ปุ่มลอยมุมขวาบน **เฉพาะบนจอสัมผัสที่ปุ่มโชว์ถาวร** แล้วปลดออกบนจอที่ hover ได้
 * (ไม่งั้นเสียความกว้างชื่อไปฟรีๆ ทั้งที่ปุ่มมองไม่เห็น — user ทัก 2026-09-19 "อย่าให้มันเบียดเนื้อหา")
 */
export function CardTitle({ reserveButton = false, className = '', children }) {
  return (
    <p className={`text-base font-semibold text-warm-900 dark:text-disc-text truncate ${reserveButton ? 'pr-10 [@media(hover:hover)]:pr-0' : ''} ${className}`}>
      {children}
    </p>
  )
}

/** บรรทัดรอง — ที่มา / เจ้าของ / เวลา */
export function CardMeta({ className = '', children }) {
  return <p className={`text-sm text-warm-500 dark:text-disc-muted ${className}`}>{children}</p>
}

/**
 * ปุ่มลอยมุมขวาบนของการ์ด (hover-reveal) — md/rules/DESIGN.md §2
 *
 * กติกาที่ห่อไว้ให้แล้ว ไม่ต้องจำเอง:
 *   1. `absolute` — ไม่กินความกว้างของเนื้อหาแม้ตอนมองไม่เห็น
 *   2. `[@media(hover:hover)]:` ไม่ใช่ `sm:` — iPad แนวนอนกว้างเกิน sm แต่ hover ไม่ได้
 *      ถ้าใช้ sm: จะได้ปุ่มโปร่งใสที่กดโดนโดยไม่ตั้งใจ (dead zone มุมขวาบน)
 *   3. `bg-card-bg` — ตอน fade in ทับข้อความ ถ้าไม่มีพื้นหลังจะอ่านเป็นตัวหนังสือซ้อนกัน
 *   4. `focus:opacity-100` — ไม่งั้นคนกด Tab หาปุ่มไม่เจอ
 *
 * ⚠️ การ์ดแม่ต้องมี `group relative` (Card ใส่ให้แล้วเป็นค่าเริ่มต้น)
 * ⚠️ ใช้กับของที่ใช้นานๆ ครั้งเท่านั้น (ลบ · เปลี่ยนชื่อ · เก็บเข้ากรุ) —
 *    ปุ่มที่เป็นงานหลักของการ์ด (เปิด · รับงาน · โทร · จ่าย) ต้องเห็นตลอด
 */
export function CardHoverActions({ className = '', children }) {
  return (
    <div
      className={
        'absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-lg bg-card-bg ' +
        'opacity-100 [@media(hover:hover)]:opacity-0 ' +
        '[@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100 ' +
        `transition ${className}`
      }
    >
      {children}
    </div>
  )
}
