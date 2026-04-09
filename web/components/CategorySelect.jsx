'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Utensils, Car, Package, Building2, Newspaper, Banknote, CreditCard,
  PartyPopper, BookOpen, Zap, Droplets, Smartphone, ShoppingCart,
  Plane, Gift, Wrench, Printer, Megaphone, Handshake, Fuel, Home,
  Stethoscope, GraduationCap, Shirt, Wifi, Camera, Music, Hammer, Folder,
  Heart, Users, MoreHorizontal, TrendingUp, Mic, AlertTriangle, Globe,
  Pill, Sparkles, Wallet, Map, ChevronDown,
} from 'lucide-react'

const ICON_MAP = {
  Utensils, Car, Package, Building2, Newspaper, Banknote, CreditCard,
  PartyPopper, BookOpen, Zap, Droplets, Smartphone, ShoppingCart,
  Plane, Gift, Wrench, Printer, Megaphone, Handshake, Fuel, Home,
  Stethoscope, GraduationCap, Shirt, Wifi, Camera, Music, Hammer, Folder,
  Heart, Users, MoreHorizontal, TrendingUp, Mic, AlertTriangle, Globe,
  Pill, Sparkles, Wallet, Map,
}

export function CatIcon({ name, size = 16, className = '' }) {
  const Icon = ICON_MAP[name] || Folder
  return <Icon size={size} className={className} />
}

export default function CategorySelect({ categories = [], value, onChange, placeholder = 'ไม่ระบุ', className = '' }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const btnRef = useRef(null)
  const dropRef = useRef(null)

  const selected = categories.find(c => String(c.id) === String(value))

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
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-xl shadow-lg max-h-56 overflow-y-auto"
    >
      <button type="button" onClick={() => { onChange(''); setOpen(false) }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
        {placeholder}
      </button>
      {categories.map(c => (
        <button key={c.id} type="button" onClick={() => { onChange(String(c.id)); setOpen(false) }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/40
            ${String(c.id) === String(value) ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'}`}>
          <CatIcon name={c.icon} size={15} className="flex-shrink-0 text-gray-500 dark:text-gray-400" />
          <span>{c.name}</span>
        </button>
      ))}
    </div>,
    document.body
  )

  return (
    <div className={className}>
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="w-full flex items-center gap-2 border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-600"
      >
        {selected ? (
          <>
            <CatIcon name={selected.icon} size={15} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
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
