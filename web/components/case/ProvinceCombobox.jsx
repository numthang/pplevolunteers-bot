'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function ProvinceCombobox({ value, onChange, provinces, placeholder }) {
  const t = useTranslations('case')
  const effectivePlaceholder = placeholder || t('newForm.provincePlaceholder')
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // sync ถ้า value เปลี่ยนจากภายนอก
  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim()
    ? provinces.filter(p => p.includes(query.trim()))
    : provinces

  function handleSelect(p) {
    onChange(p)
    setQuery(p)
    setOpen(false)
  }

  function handleInputChange(e) {
    setQuery(e.target.value)
    onChange('') // clear selection จนกว่าจะเลือกจาก dropdown
    setOpen(true)
  }

  function handleBlur() {
    // ถ้าพิมพ์แล้วตรงกับจังหวัดที่มีพอดี → auto-select
    const exact = provinces.find(p => p === query.trim())
    if (exact) { onChange(exact); setQuery(exact) }
    else if (!provinces.includes(query.trim())) { onChange(''); setQuery(value || '') }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={effectivePlaceholder}
        autoComplete="off"
        className="w-full px-3 py-2.5 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-base text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange"
      />

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.map(p => (
            <li key={p}>
              <button
                type="button"
                onMouseDown={() => handleSelect(p)}
                className={`w-full text-left px-3 py-2.5 text-base hover:bg-orange-50 dark:hover:bg-disc-hover transition
                  ${p === value ? 'font-semibold text-brand-orange' : 'text-gray-900 dark:text-disc-text'}`}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
