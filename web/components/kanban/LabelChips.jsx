'use client'

/**
 * LabelChips — ป้ายของการ์ด 1 ใบ วาดแยกเป็นกอง ไม่ใช่กองรวมพรืดเดียว
 *
 * ทำไมต้องแยกกอง: ป้าย 3 กลุ่ม (สายงาน/พื้นที่/อุปกรณ์) ปนกันแล้วอ่านไม่ออกว่าอันไหนคืออะไร
 *   → กองเดียวกัน = สีเดียวกัน (kanbanLabelColors) + มีชื่อกลุ่มนำหน้าตอนพื้นที่พอ
 *
 * ⛔ ชื่อกลุ่มมาจาก DB ล้วน — ห้ามใส่ผ่าน t() (เป็นข้อมูลที่ org ตั้งเอง ไม่ใช่ข้อความ UI)
 */

import { chipClass, groupCardLabels } from '@/lib/kanbanLabelColors.js'

export default function LabelChips({ labels = [], showGroupName = true, max = 0 }) {
  if (!labels.length) return null

  const groups = groupCardLabels(labels)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {groups.map(({ group, labels: list }) => {
        const shown = max > 0 ? list.slice(0, max) : list
        const hidden = list.length - shown.length
        return (
          <div key={group || '_'} className="flex flex-wrap items-center gap-1">
            {showGroupName && group && (
              <span className="text-[11px] text-warm-400 dark:text-disc-muted">{group}</span>
            )}
            {shown.map((l) => (
              <span
                key={l.id}
                title={group ? `${group} · ${l.name}` : l.name}
                className={`px-2 py-0.5 text-[11px] leading-5 rounded-full font-medium ${chipClass(l)}`}
              >
                {l.name}
              </span>
            ))}
            {hidden > 0 && (
              <span className="text-[11px] text-warm-400 dark:text-disc-muted">+{hidden}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
