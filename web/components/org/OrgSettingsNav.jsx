'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const TABS = [
  { href: '/org/settings', label: 'ทั่วไป' },
  { href: '/org/settings/members', label: 'สมาชิก & บทบาท' },
]

// desktop = sidebar (list แนวตั้ง) · mobile = dropdown overlay (ไม่ดันเนื้อหาลง, เมนูโตได้ไม่จำกัด)
// pattern เดียวกับ Tailwind UI settings บนเว็บ
export default function OrgSettingsNav() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const current = TABS.find(t => t.href === path) || TABS[0]

  const linkCls = (active) =>
    `block rounded-lg px-3 py-2 text-sm font-medium ${
      active
        ? 'bg-orange/10 text-orange'
        : 'text-gray-600 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover'
    }`

  return (
    <>
      {/* mobile: dropdown */}
      <div className="relative md:hidden">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg px-4 py-2.5 text-sm font-semibold text-gray-900 dark:text-disc-text">
          <span><span className="text-xs font-normal text-gray-400 dark:text-disc-muted">ตั้งค่า: </span>{current.label}</span>
          <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <nav className="absolute left-0 right-0 z-20 mt-1 flex flex-col gap-0.5 rounded-lg border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-1 shadow-lg">
              {TABS.map(t => (
                <Link key={t.href} href={t.href} onClick={() => setOpen(false)} className={linkCls(path === t.href)}>
                  {t.label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </div>

      {/* desktop: sidebar */}
      <nav className="hidden md:flex md:flex-col md:gap-0.5">
        {TABS.map(t => (
          <Link key={t.href} href={t.href} className={linkCls(path === t.href)}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
