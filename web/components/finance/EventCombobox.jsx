'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * ช่องเลือกกิจกรรมของรอบจ่าย — ใช้ 2 ที่ (ฟอร์มสร้างรอบ · modal แก้รอบ)
 *
 * ต้องพิมพ์ก่อนถึงจะมีรายการให้กด และทุกแถวบอกจังหวัด/วันที่:
 * เคยเปิด dropdown มาเป็นลิสต์เรียงตามวันที่แล้วคลิกโดนแถวแรก ได้กิจกรรมคนละจังหวัดกับบัญชี
 * โดยไม่รู้ตัว (รอบจ่าย id 1 · 2026-09) เพราะแถวโชว์แค่ชื่อ
 *
 * ค้นที่ server เสมอ — รายการมีเกิน LIMIT ของ API แล้ว ดึงมา filter ฝั่ง client จะหาตัวเก่าไม่เจอเงียบๆ
 */

const MIN_CHARS = 2

export default function EventCombobox({ value, initialLabel = '', onChange, inputCls }) {
  const t = useTranslations('finance')
  const [query, setQuery] = useState(initialLabel)
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  // ชื่อที่เลือกไว้ต้องเก็บเอง ห้ามหาย้อนจาก list — list เปลี่ยนตามคำค้น ตัวที่เลือกหลุดออกไปได้
  const selectedLabel = useRef(initialLabel)

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < MIN_CHARS) { setList([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/finance/payouts/events?q=${encodeURIComponent(q)}`)
      if (res.ok) setList(await res.json())
    }, 250)
    return () => clearTimeout(timer)
  }, [query, open])

  useEffect(() => {
    const handler = e => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(ev) {
    selectedLabel.current = ev.name
    onChange(String(ev.id))
    setQuery(ev.name)
    setOpen(false)
  }

  function handleInputChange(e) {
    selectedLabel.current = ''
    setQuery(e.target.value)
    onChange('')
    setOpen(true)
  }

  function handleBlur() {
    const exact = list.find(e => e.name === query.trim())
    if (exact) return handleSelect(exact)
    setQuery(selectedLabel.current)
  }

  const tooShort = query.trim().length < MIN_CHARS

  return (
    <div ref={containerRef} className="relative">
      <input type="text" className={inputCls} value={query}
        onChange={handleInputChange} onFocus={() => setOpen(true)} onBlur={handleBlur}
        placeholder={t('payouts.eventSearchPlaceholder')} autoComplete="off" />

      {open && (
        <ul className="absolute z-50 top-full mt-1 w-full bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {tooShort ? (
            <li className="px-3 py-2.5 text-base text-warm-400 dark:text-disc-muted">{t('payouts.eventSearchHint')}</li>
          ) : list.length === 0 ? (
            <li className="px-3 py-2.5 text-base text-warm-400 dark:text-disc-muted">{t('payouts.eventNoResults')}</li>
          ) : list.map(ev => (
            <li key={ev.id}>
              <button type="button" onMouseDown={() => handleSelect(ev)}
                className={`w-full text-left px-3 py-2.5 hover:bg-warm-50 dark:hover:bg-disc-hover ${String(ev.id) === String(value) ? 'text-teal' : 'text-warm-900 dark:text-disc-text'}`}>
                <span className="block text-base truncate">{ev.name}</span>
                <span className="block text-sm text-warm-500 dark:text-disc-muted truncate">
                  {[ev.province, ev.event_date].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
