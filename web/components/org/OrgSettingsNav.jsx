'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/org/settings', label: 'ทั่วไป' },
  { href: '/org/settings/members', label: 'สมาชิก & บทบาท' },
]

// list แนวตั้งเสมอ — mobile = stack บนเนื้อหา · desktop = sidebar ซ้าย (จัดวางใน layout grid)
// เลี่ยง underline tab (scroll แนวนอนบนมือถือเมื่อเมนูโต)
export default function OrgSettingsNav() {
  const path = usePathname()
  return (
    <nav className="flex flex-col gap-0.5">
      {TABS.map(t => {
        const active = path === t.href
        return (
          <Link key={t.href} href={t.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              active
                ? 'bg-orange/10 text-orange'
                : 'text-gray-600 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover'
            }`}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
