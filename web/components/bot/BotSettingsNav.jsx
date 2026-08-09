'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { isAdmin, isEditor } from '@/lib/roles.js'

// sidebar ของ /bot — pattern เดียวกับ components/org/OrgSettingsNav.jsx โดยตั้งใจ:
// settings ทั้งสองต้นหน้าตาเหมือนกัน ต่างกันแค่ scope (org vs Discord guild) (2026-08-09)
//
// gate ต้องตรงกับที่หน้าปลายทาง/API บังคับจริง ไม่งั้นเห็นแท็บแล้วกดเข้าไปเจอ "ไม่มีสิทธิ์"
// (ยกมาจาก DISCORD_LINKS เดิมใน Nav.jsx ที่มี adminOnly/superAdminOnly)
// ยังไม่ผ่าน t() เพราะโซน /bot ทั้งโซนยังไม่ migrate — จดไว้ที่ md/PENDING.md แล้ว
const TABS = [
  { href: '/bot',                 label: 'ภาพรวม' },
  { href: '/bot/roles',           label: 'ยศ Discord', gate: 'admin' },
  // /bot/ai แสดงต่อ superadmin (โมเดล+ai_mention) และ editor (โหมด/prompt) — ตรงกับ page.js
  { href: '/bot/ai',              label: 'AI',         gate: 'editor' },
  { href: '/bot/media/quote',     label: 'Quote' },
  { href: '/bot/media/watermark', label: 'Watermark' },
]

export default function BotSettingsNav() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const { data: session } = useSession()
  const { access, superAdmin } = useEffectiveRoles(session)   // effective — สะท้อน view-as-role

  const allowed = (gate) => {
    if (!gate) return true
    if (superAdmin) return true
    if (gate === 'admin')  return isAdmin(access)
    if (gate === 'editor') return isEditor(access)
    return true
  }
  const tabs = TABS.filter(t => allowed(t.gate))
  const current = tabs.find(tab => tab.href === path) || tabs[0]

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
          <span><span className="text-xs font-normal text-gray-400 dark:text-disc-muted">ตั้งค่าบอท · </span>{current.label}</span>
          <span className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <nav className="absolute left-0 right-0 z-20 mt-1 flex flex-col gap-0.5 rounded-lg border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-1 shadow-lg">
              {tabs.map(tab => (
                <Link key={tab.href} href={tab.href} onClick={() => setOpen(false)} className={linkCls(path === tab.href)}>
                  {tab.label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </div>

      {/* desktop: sidebar */}
      <nav className="hidden md:flex md:flex-col md:gap-0.5">
        {tabs.map(tab => (
          <Link key={tab.href} href={tab.href} className={linkCls(path === tab.href)}>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
