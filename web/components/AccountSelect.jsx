'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import BankBadge from './BankBadge'

export default function AccountSelect({ accounts = [], value, onChange, placeholder = 'ทุกบัญชี', className = '' }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const dropRef = useRef(null)

  const selected = accounts.find(a => String(a.id) === String(value))

  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (btnRef.current?.contains(e.target)) return
      if (dropRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleOpen() {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect())
    setOpen(o => !o)
  }

  const dropdown = open && rect && createPortal(
    <div ref={dropRef}
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: rect.width, zIndex: 9999 }}
      className="bg-white dark:bg-disc-hover border dark:border-disc-border rounded-xl shadow-lg max-h-64 overflow-y-auto"
    >
      <button type="button" onClick={() => { onChange(''); setOpen(false) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-disc-header">
        {placeholder}
      </button>
      {accounts.map(a => (
        <button key={a.id} type="button" onClick={() => { onChange(String(a.id)); setOpen(false) }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/40
            ${String(a.id) === String(value) ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-disc-text'}`}>
          <BankBadge bank={a.bank} size={20} />
          <span className="truncate">{a.name}</span>
        </button>
      ))}
    </div>,
    document.body
  )

  return (
    <div className={className}>
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="w-full flex items-center gap-2 border dark:border-disc-border rounded px-2 py-1 bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text text-sm text-left hover:bg-gray-50 dark:hover:bg-disc-header"
      >
        {selected ? (
          <>
            <BankBadge bank={selected.bank} size={20} />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-gray-400">{placeholder}</span>
        )}
        <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
      </button>
      {dropdown}
    </div>
  )
}
