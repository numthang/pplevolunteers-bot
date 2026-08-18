'use client'

/**
 * FieldRow — แถว `[ไอคอน · ชื่อ] | [ค่า]` บรรทัดเดียว ทรง Notion/AppFlowy
 *
 * user ส่งภาพหน้า property ของ AppFlowy มาแล้วสั่ง "ลอกได้ลอก" + "เปลี่ยนหมดทั้ง modal เลย"
 * (2026-08-18) → ทั้งของระบบ (เจ้าภาพ/สถานะ/กำหนดส่ง…) และ custom field ต้องใช้แถวตัวนี้ตัวเดียวกัน
 *
 * ⭐ **ต้องใช้ component เดียวกันทั้ง 2 ฝั่ง** เพราะความกว้างคอลัมน์ซ้ายต้องตรงกันเป๊ะ
 *    ถ้าต่างคนต่างเขียน grid เอง ค่าจะเยื้องกันทันทีที่มีคนแก้ตัวเลขข้างเดียว
 *
 * ⚠️ จอแคบ (มือถือ ~390px) พับเป็นบนล่างเสมอ — คอลัมน์ซ้ายกว้างคงที่บนจอ 390 = ค่าเหลือที่ไม่พอ
 * ⚠️ `label` เป็น node ได้ (custom field ส่งปุ่มที่คลิกเข้าโหมดแก้มา) ไม่ใช่แค่สตริง
 */

/**
 * เส้นบอกจุดวางตอนลาก — **ขึ้นทีละเส้นเดียว** ตรงที่เมาส์ลอยอยู่จริง
 * ⛔ เคยทำเป็น border-dashed ทุกแถวพร้อมกัน = ไม่ได้บอกว่าจะวางตรงไหน (user: "ดูแล้วงง" 2026-08-19)
 * ใช้ร่วมกันทั้งลาก field และลากงานย่อยในเช็คลิสต์ — ห้ามลอกไปเขียนซ้ำที่อื่น
 */
export function DropLine() {
  return <div className="h-0.5 -my-px bg-teal rounded-full" />
}

export const ROW_GRID = 'grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)] gap-x-3 gap-y-0.5'

export default function FieldRow({ icon: Icon, label, handle, children, footer, footerBefore, footerAfter, className = '', ...rest }) {
  return (
    <div className={`group ${ROW_GRID} ${className}`} {...rest}>
      {/* เส้นบอกจุดวางตอนลาก — กินเต็มความกว้าง อยู่เหนือ/ใต้แถว */}
      {footerBefore && <div className="sm:col-span-2">{footerBefore}</div>}
      <div className="flex items-center gap-1 min-w-0 sm:h-11">
        {/* หมุดลากอยู่หน้าสุด ก่อนไอคอนชนิด (user สั่ง 2026-08-18) */}
        {handle}
        {Icon && <Icon size={14} className="text-warm-400 dark:text-disc-muted shrink-0" />}
        {typeof label === 'string'
          ? <span className="text-sm text-warm-500 dark:text-disc-muted min-w-0 truncate">{label}</span>
          : label}
      </div>

      <div className="min-w-0 flex items-center gap-2">{children}</div>

      {/* แถวเสริมที่ต้องกินเต็มความกว้าง (เช่น แถวแก้ชื่อ field, เหตุผลที่ติดปัญหา) */}
      {footer && <div className="sm:col-span-2">{footer}</div>}
      {footerAfter && <div className="sm:col-span-2">{footerAfter}</div>}
    </div>
  )
}
