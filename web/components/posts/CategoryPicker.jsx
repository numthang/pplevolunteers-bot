'use client'

// เลือกหมวดจากของเดิม + พิมพ์ชื่อใหม่ได้ — ดึงออกมาจาก PostMetaPanel.jsx เพื่อใช้ซ้ำที่ PostCreate.jsx
// category ยังเป็นค่าเดียวต่อโพสต์ (ไม่ใช่ tag หลายอัน — เคาะไว้ 2026-07-29) แค่ทำ UX ให้เลือกซ้ำง่ายขึ้น
import { useState } from 'react'

const NEW_CATEGORY = ' new'   // ค่าพิเศษของ <option> "หมวดใหม่" — ห้ามชนชื่อหมวดจริง

export default function CategoryPicker({ value, onChange, categories, className }) {
  const [newCategory, setNewCategory] = useState(false)

  if (newCategory) {
    return (
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setNewCategory(false)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setNewCategory(false) }}
        placeholder="ชื่อหมวดใหม่"
        className={className}
      />
    )
  }

  return (
    <select
      value={value}
      onChange={e => {
        if (e.target.value === NEW_CATEGORY) { onChange(''); setNewCategory(true); return }
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
