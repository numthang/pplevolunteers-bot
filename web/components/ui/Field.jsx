/**
 * ช่องกรอก + ป้ายกำกับ — ชั้น primitive ของ design system
 * กฎมาจาก md/rules/DESIGN.md §Input / §Label · ห้ามลอกคลาสไปเขียนซ้ำ
 *
 * ⚠️ `w-full` ติดมากับ INPUT เสมอ — และนั่นแปลว่า **สร้างช่องแคบด้วย `${INPUT} w-20` ไม่ได้**
 *    Tailwind ตัดสินจากลำดับ utility ของตัวมันเอง ไม่ใช่ลำดับใน className → w-full ชนะทุกครั้ง
 *    ต้องการช่องแคบให้ส่ง width มาทาง className แล้วคุม box เอง (ดูช่องยอดเงินใน payouts/[id])
 */

const INPUT =
  'h-11 w-full px-3 text-base rounded-lg ' +
  'border border-warm-200 dark:border-disc-border ' +
  'bg-card-bg text-warm-900 dark:text-disc-text ' +
  'placeholder-warm-400 dark:placeholder-disc-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-teal ' +
  'disabled:opacity-50'

export default function Input({ className = '', ...rest }) {
  return <input className={`${INPUT} ${className}`} {...rest} />
}

export function Select({ className = '', children, ...rest }) {
  return <select className={`${INPUT} ${className}`} {...rest}>{children}</select>
}

export function Label({ className = '', children, ...rest }) {
  return (
    <label className={`block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1 ${className}`} {...rest}>
      {children}
    </label>
  )
}
