'use client'

import { useEffect, useState } from 'react'
import { DEBUG_COMBOS } from '@/lib/debugCombos.js'

function useDebugRole() {
  const [debugRole, setDebugRole] = useState(null)

  useEffect(() => {
    const val = document.cookie.split('; ').find(r => r.startsWith('debug_role='))?.split('=')[1]
    if (val) setDebugRole(decodeURIComponent(val))
  }, [])

  async function setRole(label) {
    await fetch('/api/debug-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: label })
    })
    window.location.reload()
  }

  async function clearRole() {
    await fetch('/api/debug-role', { method: 'DELETE' })
    window.location.reload()
  }

  return { debugRole, setRole, clearRole }
}

// ปุ่ม switcher ใน Nav (right side)
export function DebugRoleButton({ isAdmin }) {
  const { debugRole, setRole, clearRole } = useDebugRole()
  const [open, setOpen] = useState(false)

  if (!isAdmin) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="View as role"
        className={`text-xs px-2.5 py-1 rounded border transition ${
          debugRole
            ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 text-amber-700 dark:text-amber-300'
            : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
      >
        🎭 {debugRole || 'View as'}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[220px]">
            <p className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wide">จำลอง role</p>
            {DEBUG_COMBOS.map(({ label }) => (
              <button
                key={label}
                onClick={() => { setRole(label); setOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  debugRole === label
                    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {debugRole === label && '✓ '}{label}
              </button>
            ))}
            {debugRole && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <button
                  onClick={() => { clearRole(); setOpen(false) }}
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

// Banner แสดงใต้ nav เมื่อ debug mode เปิดอยู่
export function DebugRoleBanner({ isAdmin }) {
  const { debugRole, clearRole } = useDebugRole()

  if (!isAdmin || !debugRole) return null

  return (
    <div className="bg-amber-400 dark:bg-amber-500 text-amber-900 dark:text-amber-950 text-xs font-medium px-4 py-1.5 flex items-center justify-between">
      <span>🎭 Debug: กำลัง view as <strong>{debugRole}</strong></span>
      <button onClick={clearRole} className="underline hover:no-underline ml-4">
        กลับ Admin
      </button>
    </div>
  )
}
