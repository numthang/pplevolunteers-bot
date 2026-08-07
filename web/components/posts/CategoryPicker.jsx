'use client'

// เลือกหมวดจากของเดิม + พิมพ์ชื่อใหม่ได้ — ดึงออกมาจาก PostMetaPanel.jsx เพื่อใช้ซ้ำที่ PostCreate.jsx
// category ยังเป็นค่าเดียวต่อโพสต์ (ไม่ใช่ tag หลายอัน — เคาะไว้ 2026-07-29) แค่ทำ UX ให้เลือกซ้ำง่ายขึ้น
//
// ⚠️ โหมด "หมวดใหม่" ห้ามพึ่ง onBlur เป็นตัวปิด — บนมือถือ พอ native select ปิดตัวลง
//    ช่องที่เพิ่ง mount โดน blur ทันทีแล้วเด้งกลับเป็น select = เพิ่มหมวดใหม่ไม่ได้เลย (แจ้ง 2026-08-07)
//    ตอนนี้: ออกจากโหมดเมื่อ "กด ✓ / Enter / ✕ / Escape" เท่านั้น · blur ทั้งที่ยังไม่พิมพ์อะไร = อยู่ต่อ
//    และเก็บชื่อที่พิมพ์ไว้ใน draft ก่อน ไม่ยิง onChange ทุกตัวอักษร (เดิม = autosave รัวทุก keystroke
//    และการเข้าโหมดนี้ล้างหมวดเดิมทิ้งทันทีตั้งแต่ยังไม่ได้พิมพ์)
import { useState } from 'react'
import { Check, X } from 'lucide-react'

const NEW_CATEGORY = ' new'   // ค่าพิเศษของ <option> "หมวดใหม่" — ห้ามชนชื่อหมวดจริง

export default function CategoryPicker({ value, onChange, categories, className }) {
  const [draft, setDraft] = useState(null)   // null = โหมดเลือกจากลิสต์ · string = กำลังตั้งชื่อหมวดใหม่

  function commit() {
    const name = (draft || '').trim()
    if (name) onChange(name)
    setDraft(null)
  }

  if (draft !== null) {
    return (
      <span className="flex items-center gap-1 min-w-0 w-full">
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if ((draft || '').trim()) commit() }}   // พิมพ์แล้วแตะที่อื่น = บันทึก · ยังไม่พิมพ์ = อยู่ต่อ
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') setDraft(null)
          }}
          placeholder="ชื่อหมวดใหม่"
          className={`${className} flex-1 min-w-0`}
        />
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}   // กันช่องโดน blur ก่อนปุ่มได้ทำงาน
          onClick={commit}
          title="ใช้ชื่อหมวดนี้"
          className="shrink-0 p-1 rounded text-teal hover:bg-warm-50 dark:hover:bg-disc-hover"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => setDraft(null)}
          title="ยกเลิก"
          className="shrink-0 p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
        >
          <X size={14} />
        </button>
      </span>
    )
  }

  return (
    <select
      value={value}
      onChange={e => {
        if (e.target.value === NEW_CATEGORY) { setDraft(''); return }
        onChange(e.target.value)
      }}
      className={`${className} pr-7 cursor-pointer`}
    >
      <option value="">ยังไม่จัดหมวด</option>
      {/* ต้องมีหมวดปัจจุบันในลิสต์เสมอ — หมวดที่เพิ่งตั้งชื่อใหม่ยังไม่อยู่ใน /categories
          (ไม่งั้นพอกลับมาเป็น select แล้ว value ไม่ตรง option ไหนเลย → โชว์ว่าง) */}
      {[...new Set([...categories, value].filter(Boolean))].map(c => (
        <option key={c} value={c}>{c}</option>
      ))}
      <option value={NEW_CATEGORY}>+ หมวดใหม่…</option>
    </select>
  )
}
