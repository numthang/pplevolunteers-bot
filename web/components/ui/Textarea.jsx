'use client'
import useAutoGrow from '@/lib/useAutoGrow.js'

/**
 * กล่องข้อความ — **ยืดตามเนื้อหาเสมอ ไม่มีข้อยกเว้น** (md/rules/DESIGN.md §Textarea)
 * user ทักซ้ำหลายรอบ: กล่องความสูงตายตัวที่ต้องเลื่อน scroll ข้างในหรือลากมุมเอง = ผิดทั้งโปรเจกต์
 *
 * ⚠️ ต้องเป็น client component เพราะ useAutoGrow ใช้ ref + layout effect
 *    (ต่างจาก Button/Field ที่เป็น component เปล่า ไม่ต้องประกาศ 'use client')
 * ⚠️ ห้ามเรียก autoGrow ซ้ำใน onChange — hook ทำให้แล้ว 1 ครั้งต่อ render
 *    ใส่ซ้ำ = forced reflow 2 รอบต่อ 1 ตัวอักษร = พิมพ์สะดุดบนข้อความยาว
 */
export default function Textarea({ value, minHeight = 140, className = '', ...rest }) {
  const ref = useAutoGrow(value)
  return (
    <textarea
      ref={ref}
      value={value}
      style={{ minHeight: `${minHeight}px` }}
      className={
        'w-full px-3 py-2 text-base rounded-lg resize-none overflow-hidden ' +
        'border border-warm-200 dark:border-disc-border ' +
        'bg-card-bg text-warm-900 dark:text-disc-text ' +
        'placeholder-warm-400 dark:placeholder-disc-muted ' +
        `focus:outline-none focus:ring-2 focus:ring-teal ${className}`
      }
      {...rest}
    />
  )
}
