'use client'

/**
 * ImageLightbox — ดูรูปเต็มจอ (ใช้ร่วมกันได้ทุกโซน)
 *
 * ⚠️ เขียนขึ้นเพราะ lightbox ถูกก็อปซ้ำอยู่ 3 ที่แล้ว (docs/DocProjectView · posts/PostMediaPanel ·
 *    posts/ImageEditorModal) — โค้ดใหม่ให้ใช้ตัวนี้ · ของเดิมยังไม่ย้าย (จดไว้ใน md/PENDING.md)
 *
 * ปิดได้ 3 ทางตามกติกาโมดัลของโปรเจกต์: ปุ่ม X · ESC · คลิกนอกรูป
 * ⛔ keydown ต้อง stopPropagation — ไม่งั้น ESC ไหลขึ้นไปปิดโมดัลที่ครอบอยู่ (CardModal) ไปพร้อมกัน
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function ImageLightbox({ items = [], index, onIndex, onClose }) {
  const item = index == null ? null : items[index]

  useEffect(() => {
    if (!item) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowLeft' && index > 0) { e.stopPropagation(); onIndex(index - 1) }
      if (e.key === 'ArrowRight' && index < items.length - 1) { e.stopPropagation(); onIndex(index + 1) }
    }
    // capture = ได้คีย์ก่อน listener ของโมดัลที่ครอบอยู่
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [item, index, items.length, onIndex, onClose])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
      >
        <X size={22} />
      </button>
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIndex(index - 1) }}
          className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition text-2xl font-light"
        >‹</button>
      )}
      {index < items.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIndex(index + 1) }}
          className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition text-2xl font-light"
        >›</button>
      )}
      <img
        src={item.src}
        alt={item.alt || ''}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
      />
      {items.length > 1 && (
        <span className="absolute bottom-4 text-white/60 text-sm">{index + 1} / {items.length}</span>
      )}
    </div>
  )
}
