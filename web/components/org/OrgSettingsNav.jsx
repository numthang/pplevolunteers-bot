'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/org/settings', label: 'ทั่วไป' },
  { href: '/org/settings/members', label: 'สมาชิก & บทบาท' },
]

export default function OrgSettingsNav() {
  const path = usePathname()
  return (
    <nav className="flex gap-1 border-b border-gray-200 dark:border-disc-border mb-6 overflow-x-auto">
      {TABS.map(t => {
        const active = path === t.href
        return (
          <Link key={t.href} href={t.href}
            className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium -mb-px border-b-2 ${
              active
                ? 'border-orange text-orange'
                : 'border-transparent text-gray-500 dark:text-disc-muted hover:text-gray-900 dark:hover:text-disc-text'
            }`}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
