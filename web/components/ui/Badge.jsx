/**
 * ป้าย / ชิป — ชั้น primitive ของ design system
 * ขนาดจาก md/rules/DESIGN.md §Badge-Chip · ความหมายของสีจาก md/rules/DESIGN.md §5
 *
 * ⭐ **tone ผูกกับความหมาย ไม่ผูกกับชื่อสถานะใน DB** — ผู้ใช้อยากรู้ว่า "ตอนนี้ถึงไหนแล้ว"
 *    ไม่ใช่ชื่อคอลัมน์ · ให้ฟังก์ชัน JS ตัดสินขั้นแล้วคืน tone มา (ตัวอย่าง: lib/payoutStage.js)
 *
 * ⛔ บรรทัดที่มีป้ายห้ามใส่ `truncate` — ป้ายยาวเกินต้องตกบรรทัดใหม่เอง ดีกว่าโดนตัดจนอ่านไม่ออก
 *    (คนละกฎกับบรรทัดชื่อที่ต้อง truncate — ชื่อยาวเดาต่อได้ สถานะเดาไม่ได้)
 */

const TONE = {
  idle:   'bg-warm-100 text-warm-700 dark:bg-disc-hover dark:text-disc-muted',       // ร่าง / ว่างเปล่า
  active: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',            // กำลังทำ
  wait:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',    // รอคน / ค้างอยู่
  done:   'bg-teal/15 text-teal',                                                    // เสร็จ
  closed: 'bg-warm-200 text-warm-700 dark:bg-disc-header dark:text-disc-muted',      // ปิดแล้ว ย้อนไม่ได้
}

/**
 * `inline` = ป้ายที่ไปต่อท้ายบรรทัดตัวเลขในการ์ด (ท่ามาตรฐานตาม DESIGN.md §1)
 *   — ป้ายได้ที่ว่างที่ไม่มีใครใช้ โดยไม่กินความสูงเพิ่มสักพิกเซล
 */
export default function Badge({ tone = 'idle', inline = false, className = '', children }) {
  return (
    <span
      className={
        `${inline ? 'inline-block align-middle ml-1.5 px-2.5 py-0.5' : 'inline-flex items-center px-3 py-1'} ` +
        `text-sm font-medium rounded-full ${TONE[tone]} ${className}`
      }
    >
      {children}
    </span>
  )
}

export const BADGE_TONES = Object.keys(TONE)
