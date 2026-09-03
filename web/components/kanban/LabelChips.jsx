'use client'

/**
 * LabelChips — ป้ายของการ์ด 1 ใบ วาดแยกเป็นกอง ไม่ใช่กองรวมพรืดเดียว
 *
 * ทำไมต้องแยกกอง: ป้าย 3 กลุ่ม (สายงาน/พื้นที่/อุปกรณ์) ปนกันแล้วอ่านไม่ออกว่าอันไหนคืออะไร
 *   → กองเดียวกัน = สีเดียวกัน (kanbanLabelColors) + มีชื่อกลุ่มนำหน้าตอนพื้นที่พอ
 *
 * ⛔ ชื่อกลุ่มมาจาก DB ล้วน — ห้ามใส่ผ่าน t() (เป็นข้อมูลที่ org ตั้งเอง ไม่ใช่ข้อความ UI)
 */

import { chipProps, groupCardLabels } from '@/lib/kanbanLabelColors.js'

/**
 * @param {number} maxTotal จำกัดจำนวนชิปรวม**ข้ามทุกกลุ่ม** (คนละอย่างกับ `max` ที่จำกัดต่อกลุ่ม)
 *   ใช้บนหน้าการ์ด kanban (เคาะ 2026-09-02) — การ์ดที่มีหลาย field พร้อมกันเคยดันความสูงล้น
 *   เพราะ `max` เดิมจำกัดแค่ต่อกลุ่ม (3 field ละ 3 ค่า = 9 ชิป) ตัดที่นี่ก่อนจัดกลุ่มเลย
 *   แล้วโชว์ "+N" ก้อนเดียวท้ายแถวรวม แทนที่จะมี "+N" แยกในแต่ละกลุ่ม
 */
export default function LabelChips({ labels = [], showGroupName = true, max = 0, maxTotal = 0 }) {
  if (!labels.length) return null

  const shownLabels = maxTotal > 0 ? labels.slice(0, maxTotal) : labels
  const totalHidden = maxTotal > 0 ? labels.length - shownLabels.length : 0
  const groups = groupCardLabels(shownLabels)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {groups.map(({ group, labels: list }) => {
        const shown = max > 0 ? list.slice(0, max) : list
        const hidden = max > 0 ? list.length - shown.length : 0
        return (
          <div key={group || '_'} className="flex flex-wrap items-center gap-1">
            {showGroupName && group && (
              <span className="text-sm text-warm-400 dark:text-disc-muted">{group}</span>
            )}
            {/* ขนาด badge เล็กลง 1 step จากมาตรฐานโปรเจกต์ (px-3 py-1) — user สั่ง 2026-08-24 เฉพาะหน้า /kanban
                (การ์ดมีชิปติดกันหลายอันในพื้นที่แคบ) · ยังคง text-sm (ห้ามลดต่ำกว่านี้ตาม §Type scale)
                แค่ลด padding ให้เท่าชิปคนช่วยใน TagCombobox.jsx (px-2.5 py-0.5) เพื่อให้สเกลตรงกันในโซนเดียวกัน
                สีมาจากคลังสีพาสเทลของ user ผ่าน --kb + .kb-tint ใน globals.css */}
            {shown.map((l) => {
              const tint = chipProps(l)
              return (
                <span
                  key={l.id}
                  title={group ? `${group} · ${l.name}` : l.name}
                  style={tint.style}
                  className={`inline-block px-2.5 py-0.5 text-sm font-medium rounded-md whitespace-nowrap ${tint.className}`}
                >
                  {l.name}
                </span>
              )
            })}
            {hidden > 0 && (
              <span className="text-sm text-warm-400 dark:text-disc-muted">+{hidden}</span>
            )}
          </div>
        )
      })}
      {totalHidden > 0 && (
        <span className="text-sm text-warm-400 dark:text-disc-muted">+{totalHidden}</span>
      )}
    </div>
  )
}
