'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from './Providers.jsx'
import { DebugRoleButton, DebugRoleBanner } from './DebugRoleBanner.jsx'

const FINANCE_LINKS = [
  { href: '/finance',               label: 'ภาพรวม' },
  { href: '/finance/transactions',  label: 'รายการ' },
  { href: '/finance/accounts',      label: 'บัญชี' },
  { href: '/finance/categories',    label: 'หมวดหมู่' },
  { href: '/finance/report',        label: 'รายงาน' },
  { href: '/admin/logs',            label: 'Logs', roles: ['Admin', 'Moderator'] },
]

const CALLING_LINKS = [
  { href: '/calling',         label: 'Campaigns' },
  { href: '/calling/pending', label: 'Pending calls' },
]

const APPS = [
  { key: 'finance', label: 'PPLE Finance', href: '/finance' },
  { key: 'calling', label: 'PPLE Calling', href: '/calling' },
]

export default function Nav({ session }) {
  const pathname = usePathname()
  const router = useRouter()
  const { dark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [appOpen, setAppOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const campaignRef = useRef(null)

  const isCallingApp = pathname.startsWith('/calling')
  const currentApp = isCallingApp ? APPS[1] : APPS[0]
  const links = isCallingApp ? CALLING_LINKS : FINANCE_LINKS

  // Get current campaignId from URL if on campaign detail page
  const campaignIdMatch = pathname.match(/^\/calling\/(\d+)/)
  const activeCampaignId = campaignIdMatch ? parseInt(campaignIdMatch[1]) : null

  useEffect(() => {
    if (!isCallingApp) return
    fetch('/api/calling/campaigns?active=true&limit=50')
      .then(r => r.json())
      .then(d => setCampaigns(d.data || []))
      .catch(() => {})
  }, [isCallingApp])

  useEffect(() => {
    if (!campaignOpen) return
    const handleClickOutside = (e) => {
      if (campaignRef.current && !campaignRef.current.contains(e.target)) {
        setCampaignOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [campaignOpen])

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId)

  const roles = Array.isArray(session?.user?.roles)
    ? session.user.roles
    : (session?.user?.roles || '').split(',').map(r => r.trim())

  const visibleLinks = links.filter(l => {
    if (!session) return l.public
    if (l.roles) return l.roles.some(r => roles.includes(r))
    return true
  })

  const userIsAdmin = roles.includes('Admin')

  return (
    <>
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* App Switcher (Logo area) */}
        <div className="relative shrink-0">
          <button
            onClick={() => setAppOpen(o => !o)}
            className="flex items-center gap-2 hover:opacity-80 transition"
          >
            <Image src="/logo.png" alt="PPLE" width={28} height={28} />
            <span className="font-bold text-base text-indigo-700 dark:text-indigo-400">
              {currentApp.label}
            </span>
            <span className="text-gray-400 dark:text-gray-500 text-xs">▾</span>
          </button>

          {appOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setAppOpen(false)} />
              {/* Dropdown */}
              <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                {APPS.map(app => (
                  <Link
                    key={app.key}
                    href={app.href}
                    onClick={() => setAppOpen(false)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition ${
                      currentApp.key === app.key
                        ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {app.label}
                    {currentApp.key === app.key && <span className="ml-auto text-indigo-500">✓</span>}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1 ml-4">
          {visibleLinks.map(l => {
            // Campaigns link → split button when in calling section
            if (l.href === '/calling' && isCallingApp && campaigns.length > 0) {
              const isActive = pathname === '/calling' || !!activeCampaignId
              const activeClass = 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
              const inactiveClass = 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              return (
                <div key={l.href} className="relative flex items-center" ref={campaignRef}>
                  {/* Text → navigate to /calling */}
                  <Link
                    href="/calling"
                    className={`px-3 py-1 rounded-l-md text-base transition ${isActive ? activeClass : inactiveClass}`}
                  >
                    {l.label}
                  </Link>
                  {/* Arrow → open dropdown */}
                  <button
                    onClick={() => setCampaignOpen(o => !o)}
                    className={`px-1 py-1 rounded-r-md text-base transition border-l border-gray-200 dark:border-gray-700 ${isActive ? activeClass : inactiveClass}`}
                  >
                    <svg className={`w-3 h-3 transition-transform ${campaignOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {campaignOpen && (
                    <div className="absolute left-0 top-full mt-1 w-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
                      {campaigns.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setCampaignOpen(false); router.push(`/calling/${c.id}`) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition ${
                            activeCampaignId === c.id ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate pr-2">{c.name}</span>
                            {activeCampaignId === c.id && <span className="text-indigo-500 shrink-0">✓</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1 rounded-md text-base transition ${
                  pathname === l.href
                    ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          <DebugRoleButton isAdmin={userIsAdmin} />
          <button
            onClick={toggle}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
            title={dark ? 'Light mode' : 'Dark mode'}
          >
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
              <span className="hidden sm:block text-base text-gray-600 dark:text-gray-400">
                {session.user.nickname || session.user.name}
              </span>
            </a>
          ) : (
            <Link href="/login" className="text-base text-indigo-600 hover:underline">เข้าสู่ระบบ</Link>
          )}

          {session && (
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="hidden sm:block text-base text-gray-400 hover:text-red-500 transition"
            >
              ออก
            </button>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden text-gray-500 dark:text-gray-400 text-2xl w-10 h-10 flex items-center justify-center"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 flex flex-col gap-1">
          {visibleLinks.map(l => {
            // Campaigns → tree expand in mobile
            if (l.href === '/calling' && isCallingApp && campaigns.length > 0) {
              return (
                <div key={l.href}>
                  <Link
                    href="/calling"
                    onClick={() => setMenuOpen(false)}
                    className={`block px-3 py-2 rounded text-base transition ${
                      pathname === '/calling'
                        ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {l.label}
                  </Link>
                  {/* Tree children */}
                  <div className="ml-4 border-l-2 border-gray-200 dark:border-gray-700 pl-3 flex flex-col gap-0.5 mt-0.5 mb-1">
                    {campaigns.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setMenuOpen(false); router.push(`/calling/${c.id}`) }}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm transition ${
                          activeCampaignId === c.id
                            ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {activeCampaignId === c.id && <span className="mr-1">›</span>}
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }

            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-2 rounded text-base transition ${
                  pathname === l.href
                    ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {l.label}
              </Link>
            )
          })}

          {/* App switcher in mobile */}
          <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
            {APPS.map(app => (
              <Link
                key={app.key}
                href={app.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition ${
                  currentApp.key === app.key
                    ? 'text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {app.label}
                {currentApp.key === app.key && <span className="text-indigo-500">✓</span>}
              </Link>
            ))}
          </div>
          {session && (
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-left px-3 py-2 text-base text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              ออกจากระบบ
            </button>
          )}
        </div>
      )}
    </nav>
    <DebugRoleBanner isAdmin={userIsAdmin} />
    </>
  )
}
