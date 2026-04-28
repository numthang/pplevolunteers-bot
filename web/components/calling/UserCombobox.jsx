'use client'

import { useState, useRef, useEffect } from 'react'

export default function UserCombobox({ value = [], onChange, placeholder = 'ค้นหาชื่อ...' }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/calling/users?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        const selected = new Set(value.map(u => u.discord_id))
        setOptions((data.data || []).filter(u => !selected.has(u.discord_id)))
      } catch {
        setOptions([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, value])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (user) => {
    onChange([...value, user])
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleRemove = (discordId) => {
    onChange(value.filter(u => u.discord_id !== discordId))
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[46px] px-2 py-1.5 border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 rounded-lg focus-within:ring-2 focus-within:ring-teal cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(user => (
          <span
            key={user.discord_id}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal/10 text-teal rounded text-base font-medium"
          >
            {user.display_name}
            <button
              onMouseDown={e => { e.preventDefault(); handleRemove(user.discord_id) }}
              className="hover:text-red-400 leading-none text-lg"
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-base text-warm-900 dark:text-warm-50 placeholder-warm-400 outline-none py-0.5"
        />
      </div>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-warm-400">กำลังโหลด...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-warm-400">
              {query ? 'ไม่พบผู้ใช้' : 'พิมพ์เพื่อค้นหา'}
            </div>
          ) : (
            options.map(user => (
              <button
                key={user.discord_id}
                onMouseDown={() => handleSelect(user)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-base hover:bg-warm-50 dark:hover:bg-warm-dark-200 text-left"
              >
                <span className="font-medium text-warm-900 dark:text-warm-50">{user.display_name}</span>
                {user.province && (
                  <span className="text-sm text-warm-400 dark:text-warm-dark-400">{user.province}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
