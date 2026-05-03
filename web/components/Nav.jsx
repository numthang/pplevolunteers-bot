'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from './Providers.jsx'
import { DebugRoleButton, DebugRoleBanner } from './DebugRoleBanner.jsx'

function Ic({ d, className = 'w-4 h-4 shrink-0' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  overview:     'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  transactions: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
  accounts:     'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  categories:   'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
  report:       'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  logs:         'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  campaigns:    'M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z',
  pending:      'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  contacts:     'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  profile:      'M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z',
  moon:         'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z',
  sun:          'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
  logout:       'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
}

const FINANCE_LINKS = [
  { href: '/finance',               label: 'ภาพรวม',    icon: 'overview' },
  { href: '/finance/transactions',  label: 'รายการ',    icon: 'transactions' },
  { href: '/finance/categories',    label: 'หมวดหมู่',  icon: 'categories' },
  { href: '/finance/report',        label: 'รายงาน',    icon: 'report' },
  { href: '/admin/logs',            label: 'Logs',       icon: 'logs', roles: ['Admin', 'Moderator'] },
]

const CALLING_LINKS = [
  { href: '/calling',          label: 'Campaigns',    icon: 'campaigns' },
  { href: '/calling/pending',  label: 'Pending calls', icon: 'pending' },
  { href: '/calling/contacts', label: 'Contacts',      icon: 'contacts' },
]

const DASHBOARD_LINKS = [
  { href: '/finance', label: 'PPLE Finance', icon: 'transactions' },
  { href: '/calling', label: 'PPLE Calling', icon: 'campaigns' },
]

const APPS = [
  { key: 'home',    label: 'Dashboard',    href: '/dashboard', icon: 'overview' },
  { key: 'finance', label: 'PPLE Finance', href: '/finance',   icon: 'transactions' },
  { key: 'calling', label: 'PPLE Calling', href: '/calling',   icon: 'campaigns' },
]

export default function Nav({ session }) {
  const pathname = usePathname()
  const router = useRouter()
  const { dark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [appOpen, setAppOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const campaignRef = useRef(null)

  const isCallingApp = pathname.startsWith('/calling')
  const isFinanceApp = pathname.startsWith('/finance') || pathname.startsWith('/admin')
  const currentApp = isCallingApp ? APPS[2] : isFinanceApp ? APPS[1] : APPS[0]
  const links = isCallingApp ? CALLING_LINKS : isFinanceApp ? FINANCE_LINKS : DASHBOARD_LINKS

  const campaignIdMatch = pathname.match(/^\/calling\/(\d+)/)
  const activeCampaignId = campaignIdMatch ? parseInt(campaignIdMatch[1]) : null

  useEffect(() => {
    if (!isCallingApp) return
    fetch('/api/calling/campaigns?active=true&limit=50')
      .then(r => r.json())
      .then(d => setCampaigns(d.data || []))
      .catch(() => {})
    if (session) {
      fetch('/api/calling/pending?count=true')
        .then(r => r.json())
        .then(d => setPendingCount(d.count || 0))
        .catch(() => {})
    }
  }, [isCallingApp, session])

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

  const activeClass = 'bg-teal/10 dark:bg-teal/10 text-teal dark:text-teal font-medium'
  const inactiveClass = 'text-warm-500 dark:text-warm-dark-400 hover:text-warm-900 dark:hover:text-warm-50 hover:bg-warm-100 dark:hover:bg-warm-dark-200'

  return (
    <>
    <nav className="bg-white dark:bg-warm-dark-50 border-b border-warm-200 dark:border-warm-dark-300 shadow-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* App Switcher */}
        <div className="relative shrink-0">
          <div className="flex items-center gap-1">
            <Link href="/" className="hover:opacity-80 transition shrink-0">
              <Image src="/logo.png" alt="PPLE" width={28} height={28} />
            </Link>
            <button
              onClick={() => setAppOpen(o => !o)}
              className="flex items-center gap-1.5 hover:opacity-80 transition"
            >
              <span className="font-bold text-base text-teal dark:text-teal">
                {currentApp.label}
              </span>
              <span className="text-warm-400 dark:text-warm-dark-400 text-xs">▾</span>
            </button>
          </div>

          {appOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAppOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-lg shadow-lg py-1 min-w-[160px]">
                {APPS.map(app => (
                  <Link
                    key={app.key}
                    href={app.href}
                    onClick={() => setAppOpen(false)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition ${
                      currentApp?.key === app.key
                        ? 'bg-teal/10 dark:bg-teal/10 text-teal dark:text-teal font-medium'
                        : 'text-warm-900 dark:text-warm-dark-500 hover:bg-warm-100 dark:hover:bg-warm-dark-200'
                    }`}
                  >
                    {app.label}
                    {currentApp?.key === app.key && <span className="ml-auto text-teal">✓</span>}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>


        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1 ml-4">
          {visibleLinks.map(l => {
            if (l.href === '/calling' && isCallingApp && campaigns.length > 0) {
              const isActive = pathname === '/calling' || !!activeCampaignId
              return (
                <div key={l.href} className="relative flex items-center" ref={campaignRef}>
                  <Link
                    href="/calling"
                    className={`px-3 py-1 rounded-l-md text-sm transition flex items-center gap-1.5 ${isActive ? activeClass : inactiveClass}`}
                  >
                    <Ic d={ICONS[l.icon]} />
                    {l.label}
                    <span className="text-xs font-normal opacity-60">({campaigns.length})</span>
                  </Link>
                  <button
                    onClick={() => setCampaignOpen(o => !o)}
                    className={`px-1 py-1 rounded-r-md text-sm transition border-l border-warm-200 dark:border-warm-dark-300 ${isActive ? activeClass : inactiveClass}`}
                  >
                    <svg className={`w-3 h-3 transition-transform ${campaignOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {campaignOpen && (
                    <div className="absolute left-0 top-full mt-1 w-60 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-lg shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
                      {campaigns.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setCampaignOpen(false); router.push(`/calling/${c.id}`) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition ${
                            activeCampaignId === c.id ? 'text-teal dark:text-teal font-medium' : 'text-warm-900 dark:text-warm-dark-500'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate pr-2">{c.name}</span>
                            {activeCampaignId === c.id && <span className="text-teal shrink-0">✓</span>}
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
                className={`px-3 py-1 rounded-md text-sm transition flex items-center gap-1.5 ${
                  pathname === l.href ? activeClass : inactiveClass
                }`}
              >
                <Ic d={ICONS[l.icon]} />
                {l.label}
                {l.href === '/calling/pending' && pendingCount > 0 && (
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-teal/10 dark:bg-teal/10 text-teal leading-none">
                    {pendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          <DebugRoleButton isAdmin={userIsAdmin} />

          {session ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="rounded-md text-warm-500 dark:text-warm-dark-400 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition w-12 h-12 flex items-center justify-center"
              >
                {menuOpen ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-7 h-7">
                    <path d="M6 6l12 12M6 18L18 6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-7 h-7">
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-20 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl shadow-lg py-2 w-64 max-h-[80vh] overflow-y-auto flex flex-col gap-0.5">

                    {/* Nav links for current app */}
                    {visibleLinks.map(l => {
                      if (l.href === '/calling' && isCallingApp && campaigns.length > 0) {
                        return (
                          <div key={l.href}>
                            <Link
                              href="/calling"
                              onClick={() => setMenuOpen(false)}
                              className={`flex items-center gap-2 px-4 py-2.5 text-sm transition ${
                                pathname === '/calling' || !!activeCampaignId
                                  ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                                  : 'text-warm-900 dark:text-warm-dark-500 hover:bg-warm-100 dark:hover:bg-warm-dark-200'
                              }`}
                            >
                              <Ic d={ICONS[l.icon]} />
                              {l.label}
                              <span className="text-xs font-normal opacity-60">({campaigns.length})</span>
                            </Link>
                            <div className="ml-4 border-l-2 border-warm-200 dark:border-warm-dark-300 pl-3 flex flex-col gap-0.5 mb-1">
                              {campaigns.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => { setMenuOpen(false); router.push(`/calling/${c.id}`) }}
                                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition ${
                                    activeCampaignId === c.id
                                      ? 'text-teal dark:text-teal font-medium'
                                      : 'text-warm-500 dark:text-warm-dark-400 hover:bg-warm-100 dark:hover:bg-warm-dark-200'
                                  }`}
                                >
                                  {activeCampaignId === c.id && '› '}{c.name}
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
                          className={`flex items-center gap-2 px-4 py-2.5 text-sm transition ${
                            pathname === l.href
                              ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                              : 'text-warm-900 dark:text-warm-dark-500 hover:bg-warm-100 dark:hover:bg-warm-dark-200'
                          }`}
                        >
                          <Ic d={ICONS[l.icon]} />
                          {l.label}
                          {l.href === '/calling/pending' && pendingCount > 0 && (
                            <span className="ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full bg-teal/10 dark:bg-teal/10 text-teal">
                              {pendingCount}
                            </span>
                          )}
                        </Link>
                      )
                    })}

                    {/* User info */}
                    <div className="border-t border-warm-200 dark:border-warm-dark-300 my-1" />
                    <a
                      href={`https://discord.com/users/${session.user.discordId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
                    >
                      {session.user.image && (
                        <Image src={session.user.image} alt="" width={32} height={32} className="rounded-full shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-warm-900 dark:text-warm-50 truncate">
                          {session.user.nickname || session.user.name}
                        </p>
                        <p className="text-xs text-warm-500 dark:text-warm-dark-400 truncate">{session.user.name}</p>
                      </div>
                    </a>

                    {/* App switcher — only when not on dashboard */}
                    {currentApp?.key !== 'home' && (
                      <>
                        <div className="border-t border-warm-200 dark:border-warm-dark-300 my-1" />
                        {APPS.filter(a => a.key !== currentApp?.key).map(app => (
                          <Link
                            key={app.key}
                            href={app.href}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm text-warm-500 dark:text-warm-dark-400 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
                          >
                            <Ic d={ICONS[app.icon]} />
                            {app.label}
                          </Link>
                        ))}
                      </>
                    )}

                    {/* Actions */}
                    <div className="border-t border-warm-200 dark:border-warm-dark-300 my-1" />
                    <button
                      onClick={() => { toggle(); setMenuOpen(false) }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-warm-900 dark:text-warm-dark-500 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
                    >
                      <span className="flex items-center gap-2">
                        <Ic d={dark ? ICONS.sun : ICONS.moon} />
                        {dark ? 'Light mode' : 'Dark mode'}
                      </span>
                      <span className={`shrink-0 w-9 h-5 rounded-full transition-colors duration-200 relative inline-block ${dark ? 'bg-teal' : 'bg-warm-300 dark:bg-warm-dark-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${dark ? 'translate-x-4' : 'translate-x-0'}`} />
                      </span>
                    </button>
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-warm-900 dark:text-warm-dark-500 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
                    >
                      <Ic d={ICONS.profile} />
                      แก้ไขโปรไฟล์
                    </Link>
                    <div className="border-t border-warm-200 dark:border-warm-dark-300 my-1" />
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
                    >
                      <Ic d={ICONS.logout} />
                      ออกจากระบบ
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/login" className="text-sm text-teal hover:underline">เข้าสู่ระบบ</Link>
          )}
        </div>
      </div>
    </nav>
    <DebugRoleBanner isAdmin={userIsAdmin} />
    </>
  )
}
