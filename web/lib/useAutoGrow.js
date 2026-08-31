'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * กล่องข้อความยืดตามเนื้อหา — **บังคับใช้กับทุก <textarea> ที่ผู้ใช้พิมพ์ลงไป** (กฎ md/WEB.md)
 * user ทักเรื่องกล่องความสูงตายตัวซ้ำหลายรอบ · คู่กับคลาส `resize-none overflow-hidden min-h-[Npx]`
 *
 * ⚠️ ราคาแพงกว่าที่ตาเห็น: เขียน height:auto แล้วอ่าน scrollHeight ทันที = บังคับ browser คำนวณ
 *    layout ใหม่แบบ synchronous (forced reflow) → เรียกได้ **ครั้งเดียวต่อ render** เท่านั้น
 *    ห้ามเรียกซ้ำใน onChange อีก (2 reflow ต่อ 1 ตัวอักษร = พิมพ์สะดุดบนข้อความยาว)
 *
 * @example
 *   const ref = useAutoGrow(value)
 *   <textarea ref={ref} value={value} className="... resize-none overflow-hidden min-h-[140px]" />
 */
export function autoGrow(el) {
  if (!el) return
  const scrollY = window.scrollY
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
  // ปกติหน้าไม่ได้เลื่อนไปไหน — เรียก scrollTo ทิ้งๆ ทุกคีย์ก็เป็นงานเปล่าอีกก้อน
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: 'instant' })
}

// useLayoutEffect ทำงานก่อน paint (ไม่กระพริบ) แต่ฝั่ง server ไม่มี layout → กัน warning ตอน SSR
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function useAutoGrow(value, enabled = true) {
  const ref = useRef(null)
  useIsomorphicLayoutEffect(() => {
    if (enabled) autoGrow(ref.current)
  }, [value, enabled])
  return ref
}
