'use client'
import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { orgSignOut } from '@/lib/orgSignIn.js'

// top-level switcher: [ส่วนตัว ↔ องค์กร] + nav ของ context ปัจจุบัน
export default function OrgShell({ user, orgs, activeOrg, children }) {
  const active = orgs.filter(o => o.status === 'active')
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const onDoc = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function switchOrg(orgId) {
    setBusy(true)
    await fetch('/api/org/orgs/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    window.location.href = '/org'
  }

  const label = activeOrg ? activeOrg.name : 'องค์กรของฉัน'

  return (
    <div>
      {/* ── top bar ── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 dark:border-disc-border bg-white/90 dark:bg-disc-bg2/90 backdrop-blur">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-3 h-14">
          {/* workspace switcher */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-disc-border px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <span className="grid h-6 w-6 place-items-center rounded bg-orange/15 text-orange text-xs font-bold">
                {label.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[10rem] truncate">{label}</span>
              <span className="text-gray-400">▾</span>
            </button>

            {open && (
              <div className="absolute left-0 mt-1 w-64 rounded-xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg py-1 shadow-lg">
                <a href="/org/personal" className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-white/5 ${pathname.startsWith('/org/personal') ? 'text-orange font-medium' : 'text-gray-700 dark:text-disc-text'}`}>
                  <span className="grid h-6 w-6 place-items-center rounded bg-blue-light/40 text-xs">🙂</span> พื้นที่ส่วนตัว
                </a>
                <div className="my-1 border-t border-gray-100 dark:border-disc-border" />
                <p className="px-3 py-1 text-xs uppercase tracking-wide text-gray-400 dark:text-disc-muted">องค์กร</p>
                {active.map(o => (
                  <button
                    key={o.id} disabled={busy} onClick={() => switchOrg(o.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${o.id === activeOrg?.id ? 'text-orange font-medium' : 'text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-white/5'}`}
                  >
                    <span className="grid h-6 w-6 place-items-center rounded bg-orange/15 text-orange text-xs font-bold">{o.name.slice(0, 1).toUpperCase()}</span>
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.id === activeOrg?.id && <span className="text-xs">✓</span>}
                  </button>
                ))}
                <div className="my-1 border-t border-gray-100 dark:border-disc-border" />
                <a href="/org/new" className="block px-3 py-2 text-sm text-gray-500 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-white/5">+ สร้างองค์กรใหม่</a>
              </div>
            )}
          </div>

          {/* context nav (เฉพาะเมื่อมี active org) */}
          {activeOrg && (
            <nav className="flex items-center gap-1 text-sm">
              <NavTab href="/org" active={pathname === '/org'}>หน้าหลัก</NavTab>
              <NavTab href="/org/settings" active={pathname.startsWith('/org/settings')}>ตั้งค่า</NavTab>
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-400 dark:text-disc-muted max-w-[12rem] truncate">{user.email}</span>
            <button onClick={() => orgSignOut()} className="text-sm text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text">ออก</button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 py-6">{children}</main>
    </div>
  )
}

function NavTab({ href, active, children }) {
  return (
    <a href={href} className={`rounded-lg px-3 py-1.5 ${active ? 'bg-orange/10 text-orange font-medium' : 'text-gray-600 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-white/5'}`}>
      {children}
    </a>
  )
}
