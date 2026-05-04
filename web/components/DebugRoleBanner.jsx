'use client'

import { useEffect, useState, useRef } from 'react'
import { DEBUG_COMBOS } from '@/lib/debugCombos.js'

function useDebugState() {
  const [debugRole, setDebugRole] = useState(null)
  const [debugName, setDebugName] = useState(null)
  const [debugDiscordId, setDebugDiscordId] = useState(null)
  const [debugDiscordRoles, setDebugDiscordRoles] = useState(null)

  useEffect(() => {
    const getCookie = (name) => document.cookie.split('; ').find(r => r.startsWith(`${name}=`))?.split('=')[1]
    const role = getCookie('debug_role')
    const name = getCookie('debug_discord_name')
    const id   = getCookie('debug_discord_id')
    const roles = getCookie('debug_discord_roles')
    if (role)  setDebugRole(decodeURIComponent(role))
    if (name)  setDebugName(decodeURIComponent(name))
    if (id)    setDebugDiscordId(decodeURIComponent(id))
    if (roles) setDebugDiscordRoles(decodeURIComponent(roles))
  }, [])

  async function setCombo(label) {
    await fetch('/api/debug-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: label }),
    })
    window.location.reload()
  }

  async function setMember(discordId, displayName, roles) {
    await fetch('/api/debug-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId, displayName, roles }),
    })
    window.location.reload()
  }

  async function clear() {
    await fetch('/api/debug-role', { method: 'DELETE' })
    window.location.reload()
  }

  const label = debugName ? `@${debugName}` : debugRole
  const active = !!debugRole || !!debugName

  return { label, active, setCombo, setMember, clear, debugDiscordId, debugDiscordRoles, debugRole }
}

function MemberSearch({ onSelect }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/debug-role/search?q=${encodeURIComponent(q)}`)
      setResults(await res.json())
      setLoading(false)
    }, 300)
  }, [q])

  return (
    <div className="px-2 pb-1">
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="ค้นหา member..."
        className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
      {loading && <p className="text-xs text-gray-400 px-1 pt-1">กำลังค้นหา...</p>}
      {results.map(m => (
        <button
          key={m.discordId}
          onClick={() => onSelect(m)}
          className="w-full text-left px-2 py-1.5 mt-0.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition"
        >
          <span className="font-medium">{m.displayName}</span>
          {m.nickname && m.nickname !== m.displayName && (
            <span className="text-gray-400 ml-1">({m.nickname})</span>
          )}
          {m.province && <span className="ml-1 text-amber-600 dark:text-amber-400">{m.province}</span>}
        </button>
      ))}
    </div>
  )
}

export function DebugRoleButton({ isAdmin }) {
  const { label, active, setCombo, setMember, clear } = useDebugState()
  const [open, setOpen] = useState(false)

  if (!isAdmin) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="View as role"
        className={`text-xs px-2.5 py-1 rounded border transition ${
          active
            ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 text-amber-700 dark:text-amber-300'
            : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        {active ? `🎭 ${label}` : '🎭'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[240px] max-h-[420px] overflow-y-auto">

            {/* Member search */}
            <p className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">จำลองจาก member จริง</p>
            <MemberSearch onSelect={m => { setMember(m.discordId, m.displayName, m.roles); setOpen(false) }} />

            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

            {/* Predefined combos */}
            <p className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">role combo</p>
            {DEBUG_COMBOS.map(({ label: comboLabel }) => (
              <button
                key={comboLabel}
                onClick={() => { setCombo(comboLabel); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  label === comboLabel
                    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {label === comboLabel && '✓ '}{comboLabel}
              </button>
            ))}

            {active && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => { clear(); setOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  ยกเลิก / กลับ Admin
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function DebugRoleBanner({ isAdmin }) {
  const { label, active, clear, debugDiscordId, debugDiscordRoles, debugRole } = useDebugState()

  if (!isAdmin || !active) return null

  // roles string: impersonate mode → from cookie, combo mode → from DEBUG_COMBOS
  const rolesDisplay = debugDiscordRoles
    || (debugRole ? (DEBUG_COMBOS.find(c => c.label === debugRole)?.roles || []).join(', ') : '')

  return (
    <div className="bg-amber-400 dark:bg-amber-500 text-amber-900 dark:text-amber-950 text-xs font-medium px-4 py-1.5 flex items-center justify-between gap-2 flex-wrap">
      <span className="flex items-center gap-2 flex-wrap">
        <span>🎭 Debug: กำลัง view as <strong>{label}</strong></span>
        {debugDiscordId && (
          <span className="opacity-70 font-mono select-all">{debugDiscordId}</span>
        )}
        {rolesDisplay && (
          <span className="opacity-80">— {rolesDisplay}</span>
        )}
      </span>
      <button onClick={clear} className="underline hover:no-underline shrink-0">
        กลับ Admin
      </button>
    </div>
  )
}
