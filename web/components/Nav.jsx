'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState } from 'react'
import { useTheme } from './Providers.jsx'

const links = [
  { href: '/',                     label: 'หน้าแรก', public: true },
  { href: '/dashboard',            label: 'ภาพรวม' },
  { href: '/finance/transactions', label: 'รายการ' },
  { href: '/finance/accounts',     label: 'บัญชี' },
  { href: '/finance/categories',   label: 'หมวดหมู่' },
  { href: '/settings',             label: 'ตั้งค่า' },
]

export default function Nav({ session }) {
  const pathname = usePathname()
  const { dark, toggle } = useTheme()
  const [open, setOpen] = useState(false)

  const visibleLinks = links.filter(l => l.public || session)

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="PPLE" width={28} height={28} />
          <span className="font-bold text-indigo-700 dark:text-indigo-400">PPLE Finance</span>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1 ml-4">
          {visibleLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded text-sm transition ${
                pathname === l.href
                  ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          <button onClick={toggle} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition" title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? '☀️' : '🌙'}
          </button>

          {session ? (
            <a
              href={`https://discord.com/users/${session.user.discordId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              {session.user.image && (
                <Image src={session.user.image} alt="" width={28} height={28} className="rounded-full" />
              )}
              <span className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">
                {session.user.nickname || session.user.name}
              </span>
            </a>
          ) : (
            <Link href="/login" className="text-sm text-indigo-600 hover:underline">เข้าสู่ระบบ</Link>
          )}

          {session && (
            <button onClick={() => signOut({ callbackUrl: '/' })} className="hidden sm:block text-sm text-gray-400 hover:text-red-500 transition">
              ออก
            </button>
          )}

          {/* Hamburger */}
          <button onClick={() => setOpen(o => !o)} className="md:hidden text-gray-500 dark:text-gray-400">
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 flex flex-col gap-1">
          {visibleLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded text-sm transition ${
                pathname === l.href
                  ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {l.label}
            </Link>
          ))}
          {session && (
            <button onClick={() => signOut({ callbackUrl: '/' })} className="text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              ออกจากระบบ
            </button>
          )}
        </div>
      )}
    </nav>
  )
}
