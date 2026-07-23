'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { signIn, signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import { useTheme } from './Providers.jsx'
import { DebugRoleButton, DebugRoleBanner } from './DebugRoleBanner.jsx'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import { isAdmin } from '@/lib/roles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { canManageCases } from '@/lib/caseAccess.js'
import LocaleSwitcher from './LocaleSwitcher.jsx'
import OrgSwitcherMenu from './OrgSwitcherMenu.jsx'

function Ic({ d, className = 'w-4 h-4 shrink-0' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

function GuildIcon({ guild, className = 'w-7 h-7' }) {
  if (guild?.icon_url) {
    return <Image src={guild.icon_url} alt={guild.name} width={28} height={28} className={`${className} rounded-full object-cover shrink-0`} />
  }
  const abbr = guild?.name?.split(/\s+/).map(w => w[0]).slice(0, 2).join('') || '?'
  return (
    <span className={`${className} rounded-full bg-teal/20 text-teal flex items-center justify-center text-xs font-bold shrink-0 select-none`}>
      {abbr}
    </span>
  )
}

const ICONS = {
  overview:     'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  transactions: 'M5.25 3.75A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25zM3.75 9a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.75zm0 3a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.75zM8.25 15a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
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
  logout:         'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75',
  integrations:   'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
  social:         'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
  droplet:        'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C7 11.1 6 13 6 15a7 7 0 0 0 6 7z',
  quote:          'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  server:         'M5 4h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 10h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z',
  media:          'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  ai:             'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z',
  docs:           'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  settings:       'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

const FINANCE_LINKS = [
  { href: '/finance',               label: 'Overview',    icon: 'overview', exact: true },
  { href: '/finance/transactions',  label: 'Transactions', icon: 'transactions' },
  { href: '/finance/categories',    label: 'Categories',  icon: 'categories' },
  { href: '/finance/report',        label: 'Report',      icon: 'report' },
]

const CALLING_LINKS = [
  { href: '/calling',           label: 'Dashboard',  icon: 'overview',  exact: true },
  { href: '/calling/campaigns', label: 'Campaigns',  icon: 'campaigns' },
  { href: '/calling/assignee',  label: 'Assignee',   icon: 'pending' },
  { href: '/calling/contacts',  label: 'Contacts',   icon: 'contacts',  hamburgerOnly: true },
  { href: '/calling/stats',     label: 'Statistics', icon: 'report',    hamburgerOnly: true },
]

const DOCS_LINKS = [
  { href: '/docs',          label: 'Projects', icon: 'docs',     exact: true, docsAccess: true },
  { href: '/docs/pending',  label: 'รอเซ็น',   icon: 'pending' },   // คนทั่วไปก็เห็น (ไม่ gate)
  { href: '/docs/settings', label: 'Settings', icon: 'settings', adminOnly: true },
]

const DISCORD_LINKS = [
  { href: '/bot/media/basket',     label: 'Basket',    icon: 'media',    mediaGroup: true },
  { href: '/bot/media/quote',      label: 'Quote',     icon: 'quote',    mediaGroup: true },
  { href: '/bot/media/watermark',  label: 'Watermark', icon: 'droplet',  mediaGroup: true },
  { href: '/bot/platforms',        label: 'Platforms', icon: 'social',   menuOnly: true },
  { href: '/bot/features',         label: 'Features',  icon: 'overview', menuOnly: true, superAdminOnly: true },
  { href: '/bot/roles',            label: 'Roles',     icon: 'logs',     menuOnly: true, adminOnly: true },
  { href: '/bot/ai',               label: 'AI',        icon: 'ai',       menuOnly: true },
]

const CASE_LINKS = [
  { href: '/case',        label: 'Complaints', icon: 'overview', exact: true },
  { href: '/case/manage', label: 'Cases',      icon: 'logs',     exact: true },
]

const SOCIAL_LINKS = [
  { href: '/social', label: 'My Accounts', icon: 'social' },
]

const DASHBOARD_LINKS = [
  { href: '/finance',      label: 'FINANCE',  icon: 'transactions', feature: 'finance' },
  { href: '/calling',      label: 'CALLING',  icon: 'campaigns', feature: 'calling' },
  { href: '/docs',         label: 'DOCS',     icon: 'docs',      feature: 'docs', docsAccess: true },
  { href: '/case/manage',  label: 'CASES',    icon: 'logs',      feature: 'cases', casesAccess: true },
]

const APPS = [
  { key: 'home',     label: 'DASHBOARD', href: '/',               icon: 'overview' },
  { key: 'finance',  label: 'FINANCE',   href: '/finance',        icon: 'transactions', feature: 'finance' },
  { key: 'calling',  label: 'CALLING',   href: '/calling',        icon: 'campaigns', feature: 'calling' },
  { key: 'docs',     label: 'DOCS',      href: '/docs',           icon: 'docs',      feature: 'docs' },
  { key: 'cases',    label: 'CASES',     href: '/case/manage',    icon: 'logs',      feature: 'cases', casesAccess: true },
  { key: 'discord',  label: 'BOT',       href: '/bot/platforms',  icon: 'social' },
]

// app ที่ใช้ได้แม้ org ไม่มี guild — ตอนนี้ org-native ครบทั้ง 4 แล้ว (calling 2026-07-19 ·
// docs/cases Phase 2) เหลือแต่ BOT ที่ต้องมี Discord จริง · การเปิด/ปิดคุมด้วย featureOn
const ORG_NATIVE_APP_KEYS = new Set(['home', 'finance', 'calling', 'docs', 'cases'])

export default function Nav({ session, orgs = [], activeOrgId = null, guilds = [], currentGuildId = null, enabledFeatures = [] }) {
  const pathname = usePathname()
  const router = useRouter()
  const { dark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [docOpen, setDocOpen] = useState(false)
  const mediaRef = useRef(null)
  const [campaigns, setCampaigns] = useState([])
  const [docProjects, setDocProjects] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [docsPendingCount, setDocsPendingCount] = useState(0)
  const campaignRef = useRef(null)
  const docRef = useRef(null)

  const isCallingApp   = pathname.startsWith('/calling')
  const isFinanceApp   = pathname.startsWith('/finance')
  const isSocialApp    = pathname.startsWith('/social')
  const isDiscordApp   = pathname.startsWith('/bot')
  const isDocsApp      = pathname.startsWith('/docs')
  const isCaseApp      = pathname.startsWith('/case')
  const isLinkActive = (href, exact = false) => {
    if (exact) return pathname === href
    return pathname === href || (href !== '/' && pathname.startsWith(href))
  }
  const appByKey = (key) => APPS.find(a => a.key === key)
  const currentApp = isDiscordApp ? appByKey('discord') : isDocsApp ? appByKey('docs')
    : isCallingApp ? appByKey('calling') : isFinanceApp ? appByKey('finance')
    : isCaseApp ? appByKey('cases') : appByKey('home')
  const links = isDiscordApp ? DISCORD_LINKS : isSocialApp ? SOCIAL_LINKS : isDocsApp ? DOCS_LINKS
    : isCallingApp ? CALLING_LINKS : isFinanceApp ? FINANCE_LINKS
    : isCaseApp ? CASE_LINKS : DASHBOARD_LINKS

  const campaignIdMatch = pathname.match(/^\/calling\/assignments\/(\d+)/)
  const activeCampaignId = campaignIdMatch ? parseInt(campaignIdMatch[1]) : null

  const docIdMatch = pathname.match(/^\/docs\/(\d+)/)
  const activeDocId = docIdMatch ? parseInt(docIdMatch[1]) : null

  const { access, superAdmin } = useEffectiveRoles(session)

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
    if (!isDocsApp || !canManageDocs(access)) return
    fetch('/api/docs/projects?active=true')
      .then(r => r.json())
      .then(d => setDocProjects(d.data || []))
      .catch(() => {})
  }, [isDocsApp, session, access])

  // นับรายการรอเซ็นของ user คนนี้ (global badge — เห็นได้ทุกหน้าถ้า docs เปิด)
  useEffect(() => {
    if (!session || !enabledFeatures.includes('docs')) return
    fetch('/api/docs/pending?count=true')
      .then(r => r.json())
      .then(d => setDocsPendingCount(d.total || 0))
      .catch(() => {})
  }, [session, enabledFeatures, pathname])

  useEffect(() => {
    if (!campaignOpen && !mediaOpen && !docOpen) return
    const handleClickOutside = (e) => {
      if (campaignRef.current && !campaignRef.current.contains(e.target)) setCampaignOpen(false)
      if (docRef.current && !docRef.current.contains(e.target)) setDocOpen(false)
      if (mediaRef.current && !mediaRef.current.contains(e.target)) setMediaOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [campaignOpen, mediaOpen, docOpen])

  const activeCampaign = campaigns.find(c => c.id === activeCampaignId)

  const featureOn = (f) => !f || enabledFeatures.includes(f)
  // effective access + effective superAdmin → เมนู admin สะท้อน view-as-role (debug ทุก role ทุกหน้า)
  // ใช้ effective superAdmin (จาก /api/me/access) ไม่ใช่ session.user.isSuperAdmin (real) ไม่งั้น debug ไม่ซ่อนเมนู
  // exit ไม่ติดกับเพราะ DebugRoleButton/Banner โผล่จาก cookie active ไม่ผูก isAdmin
  const userIsAdmin = isAdmin(access) || superAdmin

  const visibleLinks = links.filter(l => {
    if (!featureOn(l.feature)) return false
    if (!session) return l.public
    if (l.superAdminOnly && !superAdmin) return false
    if (l.adminOnly && !userIsAdmin) return false
    if (l.capability) return can(l.capability, access?.permissions || [])
    if (l.docsAccess) return canManageDocs(access)
    if (l.casesAccess) return canManageCases(access)
    return true
  })
  const mediaLinks = visibleLinks.filter(l => l.mediaGroup)
  // home: app tabs ใหม่แทน DASHBOARD_LINKS แล้ว → ไม่ต้องโชว์ sub-nav ซ้ำ · app อื่นโชว์ sub-page จริง
  const isHomeApp  = currentApp.key === 'home'
  const topLinks   = isHomeApp ? [] : visibleLinks.filter(l => !l.menuOnly && !l.hamburgerOnly && !l.mediaGroup)
  const menuLinks  = visibleLinks

  // guildless org (self-serve, ไม่มี Discord guild) → เห็นเฉพาะ app org-native (finance)
  const isGuildless = guilds.length === 0
  const visibleApps = APPS.filter(a => {
    if (isGuildless && !ORG_NATIVE_APP_KEYS.has(a.key)) return false
    if (!featureOn(a.feature)) return false
    // docs เปิดให้ทุกคน (คนทั่วไปเข้าได้ที่หน้ารอเซ็น) — gate ระดับ feature toggle พอ
    return true
  })

  const currentGuild = guilds.find(g => g.guild_id === currentGuildId) || guilds[0] || null

  // Org switcher (main nav) — OrgSwitcherMenu (desktop) · mobile ยังใช้ list ใน hamburger
  const canSwitchOrg = orgs.length > 1
  const canSwitchGuild = guilds.length > 1   // org หลาย guild (org 1) → เลือก guild ย่อยได้

  const switchGuild = async (gid) => {
    setMenuOpen(false)
    if (gid === currentGuildId) return
    setSwitching(true)
    try {
      const res = await fetch('/api/guild/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: gid }),
      })
      if (res.ok) { window.dispatchEvent(new Event('guild-switched')); router.refresh() }
    } catch {}
    setSwitching(false)
  }

  // เลือก org → เก็บ active_org (switch route dual-write selected_guild ให้ guild-based features ตาม)
  const switchOrg = async (orgId) => {
    setMenuOpen(false)
    if (orgId === activeOrgId) return
    setSwitching(true)
    try {
      const res = await fetch('/api/org/orgs/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      if (res.ok) { window.dispatchEvent(new Event('guild-switched')); router.refresh() }
    } catch {}
    setSwitching(false)
  }

  const activeClass = 'bg-teal/10 dark:bg-teal/10 text-teal dark:text-teal font-medium'
  const inactiveClass = 'text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text hover:bg-warm-100 dark:hover:bg-disc-hover'

  return (
    <>
    <nav className="bg-white dark:bg-disc-bg2 border-b border-warm-200 dark:border-disc-border shadow-sm sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">

        {/* Org Switcher (main nav) — Notion/AppFlowy style, เปิดเมนูได้เสมอแม้ org เดียว */}
        {session ? (
          <OrgSwitcherMenu
            orgs={orgs}
            activeOrgId={activeOrgId}
            user={session.user}
            activeIconUrl={currentGuild?.icon_url || null}
          />
        ) : (
          <Link href="/" className="hover:opacity-80 transition shrink-0">
            <Image src="/logo.png" alt="PPLE" width={40} height={40} />
          </Link>
        )}


        {/* App tabs ย้ายออกจาก topbar (เบียดกัน) → เข้าถึงผ่าน hamburger + การ์ดหน้า dashboard */}

        {/* Nav links (sub-nav ของ app ปัจจุบัน) */}
        <div className="flex items-center gap-0 ml-1">
          {/* สื่อ dropdown (quote + watermark) — เฉพาะ BOT section */}
          {isDiscordApp && mediaLinks.length > 0 && (
            <div className="relative" ref={mediaRef}>
              <button
                onClick={() => setMediaOpen(o => !o)}
                className={`flex items-center gap-1 px-1 py-1 rounded-md text-base transition ${
                  mediaLinks.some(l => isLinkActive(l.href))
                    ? activeClass
                    : inactiveClass
                }`}
              >
                <Ic d={ICONS.quote} className="w-7 h-7 shrink-0" />
                <span className="hidden md:inline">Media</span>
                <svg className={`w-3 h-3 transition-transform hidden md:block ${mediaOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              {mediaOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMediaOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-lg shadow-lg py-1 min-w-[160px]">
                    {mediaLinks.map(l => (
                      <Link key={l.href} href={l.href} onClick={() => setMediaOpen(false)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-base transition ${
                          isLinkActive(l.href)
                            ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                            : 'text-warm-900 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
                        }`}>
                        <Ic d={ICONS[l.icon]} className="w-4 h-4 shrink-0" />
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {topLinks.map(l => {
            if (l.href === '/docs' && isDocsApp && docProjects.length > 0) {
              const isActive = pathname === '/docs' || !!activeDocId
              return (
                <div key={l.href} className="relative flex items-center" ref={docRef}>
                  <Link
                    href="/docs"
                    className={`px-1 py-1 rounded-l-md text-base transition flex items-center gap-1 ${isActive ? activeClass : inactiveClass}`}
                  >
                    <Ic d={ICONS[l.icon]} className="w-7 h-7 shrink-0" />
                    <span className="hidden md:inline">{l.label}</span>
                    <span className="text-xs font-normal opacity-60">({docProjects.length})</span>
                  </Link>
                  <button
                    onClick={() => setDocOpen(o => !o)}
                    className={`px-1.5 py-1 rounded-r-md text-sm transition border-l border-warm-200 dark:border-disc-border ${isActive ? activeClass : inactiveClass}`}
                  >
                    <svg className={`w-3 h-3 transition-transform ${docOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {docOpen && (
                    <div className="absolute left-0 top-full mt-1 w-80 bg-white dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-lg shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
                      {docProjects.map(p => (
                        <button
                          key={p.act_event_cache_id}
                          onClick={() => { setDocOpen(false); router.push(`/docs/${p.act_event_cache_id}`) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-warm-50 dark:hover:bg-disc-hover transition ${
                            activeDocId === p.act_event_cache_id ? 'text-teal dark:text-teal font-medium' : 'text-warm-900 dark:text-disc-muted'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="leading-snug">{p.event_name}</span>
                            {activeDocId === p.act_event_cache_id && <span className="text-teal shrink-0">✓</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            if (l.href === '/calling/campaigns' && isCallingApp && campaigns.length > 0) {
              const isActive = pathname === '/calling/campaigns' || !!activeCampaignId
              return (
                <div key={l.href} className="relative flex items-center" ref={campaignRef}>
                  <Link
                    href="/calling/campaigns"
                    className={`px-1 py-1 rounded-l-md text-base transition flex items-center gap-1 ${isActive ? activeClass : inactiveClass}`}
                  >
                    <Ic d={ICONS[l.icon]} className="w-7 h-7 shrink-0" />
                    <span className="hidden md:inline">{l.label}</span>
                    <span className="text-xs font-normal opacity-60">({campaigns.length})</span>
                  </Link>
                  <button
                    onClick={() => setCampaignOpen(o => !o)}
                    className={`px-1.5 py-1 rounded-r-md text-sm transition border-l border-warm-200 dark:border-disc-border ${isActive ? activeClass : inactiveClass}`}
                  >
                    <svg className={`w-3 h-3 transition-transform ${campaignOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {campaignOpen && (
                    <div className="absolute left-0 top-full mt-1 w-60 bg-white dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-lg shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
                      {campaigns.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setCampaignOpen(false); router.push(`/calling/assignments/${c.id}`) }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-warm-50 dark:hover:bg-disc-hover transition ${
                            activeCampaignId === c.id ? 'text-teal dark:text-teal font-medium' : 'text-warm-900 dark:text-disc-muted'
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
                className={`flex px-1 py-1 rounded-md text-base transition items-center gap-1 ${
                  (l.href === '/calling/stats' || l.href === '/admin/logs' || (l.href === '/calling' && isCallingApp) || l.href === '/docs/settings') ? 'hidden md:flex' : 'flex'
                } ${
                  isLinkActive(l.href, l.exact) ? activeClass : inactiveClass
                }`}
              >
                <Ic d={ICONS[l.icon]} className="w-7 h-7 shrink-0" />
                <span className="hidden md:inline">{l.label}</span>
                {l.href === '/calling/assignee' && pendingCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange text-white leading-none">
                    {pendingCount}
                  </span>
                )}
                {l.href === '/docs/pending' && docsPendingCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange text-white leading-none">
                    {docsPendingCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden md:flex">
            <DebugRoleButton isAdmin={userIsAdmin} />
          </div>

          {session ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(o => !o)}
                className="rounded-md text-warm-500 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition w-12 h-12 flex items-center justify-center"
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
                  <div className="absolute right-0 top-full mt-2 z-20 bg-white dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-xl shadow-lg py-2 w-64 max-h-[80vh] overflow-y-auto flex flex-col gap-0.5">

                    {/* Nav links for current app — ซ่อนเมื่ออยู่ home (ซ้ำกับ app switcher) */}
                    {(isFinanceApp || isCallingApp || isDocsApp || isDiscordApp || isCaseApp || isSocialApp) && menuLinks.map(l => {
                      if (l.href === '/docs' && isDocsApp && docProjects.length > 0) {
                        return (
                          <div key={l.href}>
                            <Link
                              href="/docs"
                              onClick={() => setMenuOpen(false)}
                              className={`flex items-center gap-2 px-4 py-2.5 text-base transition ${
                                pathname === '/docs' || !!activeDocId
                                  ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                                  : 'text-warm-900 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
                              }`}
                            >
                              <Ic d={ICONS[l.icon]} className="w-7 h-7 shrink-0" />
                              {l.label}
                              <span className="text-xs font-normal opacity-60">({docProjects.length})</span>
                            </Link>
                            <div className="ml-4 border-l-2 border-warm-200 dark:border-disc-border pl-3 flex flex-col gap-0.5 mb-1">
                              {docProjects.map(p => (
                                <button
                                  key={p.act_event_cache_id}
                                  onClick={() => { setMenuOpen(false); router.push(`/docs/${p.act_event_cache_id}`) }}
                                  className={`w-full text-left px-2 py-1.5 rounded text-base transition ${
                                    activeDocId === p.act_event_cache_id
                                      ? 'text-teal dark:text-teal font-medium'
                                      : 'text-warm-500 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
                                  }`}
                                >
                                  {activeDocId === p.act_event_cache_id && '› '}{p.event_name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      if (l.href === '/calling/campaigns' && isCallingApp && campaigns.length > 0) {
                        return (
                          <div key={l.href}>
                            <Link
                              href="/calling/campaigns"
                              onClick={() => setMenuOpen(false)}
                              className={`flex items-center gap-2 px-4 py-2.5 text-base transition ${
                                pathname === '/calling/campaigns' || !!activeCampaignId
                                  ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                                  : 'text-warm-900 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
                              }`}
                            >
                              <Ic d={ICONS[l.icon]} className="w-7 h-7 shrink-0" />
                              {l.label}
                              <span className="text-xs font-normal opacity-60">({campaigns.length})</span>
                            </Link>
                            <div className="ml-4 border-l-2 border-warm-200 dark:border-disc-border pl-3 flex flex-col gap-0.5 mb-1">
                              {campaigns.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => { setMenuOpen(false); router.push(`/calling/assignments/${c.id}`) }}
                                  className={`w-full text-left px-2 py-1.5 rounded text-base transition ${
                                    activeCampaignId === c.id
                                      ? 'text-teal dark:text-teal font-medium'
                                      : 'text-warm-500 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
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
                          className={`flex items-center gap-2 px-4 py-2.5 text-base transition ${
                            isLinkActive(l.href, l.exact)
                              ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                              : 'text-warm-900 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
                          }`}
                        >
                          <Ic d={ICONS[l.icon]} className="w-7 h-7 shrink-0" />
                          {l.label}
                          {l.href === '/calling/assignee' && pendingCount > 0 && (
                            <span className="ml-auto text-xs font-semibold px-2 py-1 rounded-full bg-orange text-white">
                              {pendingCount}
                            </span>
                          )}
                          {l.href === '/docs/pending' && docsPendingCount > 0 && (
                            <span className="ml-auto text-xs font-semibold px-2 py-1 rounded-full bg-orange text-white">
                              {docsPendingCount}
                            </span>
                          )}
                        </Link>
                      )
                    })}

                    {/* User info */}
                    <div className="border-t border-warm-200 dark:border-disc-border my-1" />
                    <a
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                    >
                      {session.user.image && (
                        <Image src={session.user.image} alt="" width={32} height={32} className="rounded-full shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-base font-medium text-warm-900 dark:text-disc-text truncate">
                          {session.user.nickname || session.user.name}
                        </p>
                        <p className="text-xs text-warm-500 dark:text-disc-muted truncate">{session.user.name}</p>
                      </div>
                    </a>

                    {/* Org switcher (mobile) */}
                    {canSwitchOrg && (
                      <>
                        <div className="border-t border-warm-200 dark:border-disc-border my-1" />
                        <div className="px-4 py-1 text-xs text-warm-400 dark:text-disc-muted">องค์กร</div>
                        {orgs.map(o => (
                          <button
                            key={o.id}
                            onClick={() => switchOrg(o.id)}
                            disabled={switching}
                            className={`w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-base transition disabled:opacity-60 ${
                              o.id === activeOrgId
                                ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                                : 'text-warm-900 dark:text-disc-text hover:bg-warm-100 dark:hover:bg-disc-hover'
                            }`}
                          >
                            <GuildIcon guild={{ name: o.name }} className="w-6 h-6" />
                            <span className="truncate">{o.name}</span>
                            {o.id === activeOrgId && <span className="ml-auto text-teal shrink-0">✓</span>}
                          </button>
                        ))}
                      </>
                    )}

                    {/* Guild sub-switcher (mobile) — org หลาย guild เท่านั้น */}
                    {canSwitchGuild && (
                      <>
                        <div className="border-t border-warm-200 dark:border-disc-border my-1" />
                        <div className="px-4 py-1 text-xs text-warm-400 dark:text-disc-muted">เซิร์ฟเวอร์</div>
                        {guilds.map(g => (
                          <button
                            key={g.guild_id}
                            onClick={() => { setMenuOpen(false); switchGuild(g.guild_id) }}
                            disabled={switching}
                            className={`w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-base transition disabled:opacity-60 ${
                              g.guild_id === currentGuildId
                                ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                                : 'text-warm-900 dark:text-disc-text hover:bg-warm-100 dark:hover:bg-disc-hover'
                            }`}
                          >
                            <GuildIcon guild={g} className="w-6 h-6" />
                            <span className="truncate">{g.name}</span>
                            {g.guild_id === currentGuildId && <span className="ml-auto text-teal shrink-0">✓</span>}
                          </button>
                        ))}
                      </>
                    )}

                    {/* App switcher */}
                    <div className="border-t border-warm-200 dark:border-disc-border my-1" />
                    {visibleApps.map(app => (
                      <Link
                        key={app.key}
                        href={app.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-base transition ${
                          currentApp?.key === app.key
                            ? 'text-teal dark:text-teal font-medium bg-teal/10 dark:bg-teal/10'
                            : 'text-warm-900 dark:text-disc-text hover:bg-warm-100 dark:hover:bg-disc-hover'
                        }`}
                      >
                        <Ic d={ICONS[app.icon]} className="w-7 h-7 shrink-0" />
                        {app.label}
                        {app.key === 'docs' && docsPendingCount > 0 && (
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full bg-orange text-white ${currentApp?.key === app.key ? '' : 'ml-auto'}`}>
                            {docsPendingCount}
                          </span>
                        )}
                        {currentApp?.key === app.key && <span className="ml-auto text-teal">✓</span>}
                      </Link>
                    ))}

                    {/* Actions */}
                    <div className="border-t border-warm-200 dark:border-disc-border my-1" />
                    <button
                      onClick={() => { toggle(); setMenuOpen(false) }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-base text-warm-900 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                    >
                      <span className="flex items-center gap-2">
                        <Ic d={dark ? ICONS.sun : ICONS.moon} className="w-7 h-7 shrink-0" />
                        {dark ? 'Light mode' : 'Dark mode'}
                      </span>
                      <span className={`shrink-0 w-9 h-5 rounded-full transition-colors duration-200 relative inline-block ${dark ? 'bg-teal' : 'bg-warm-300 dark:bg-disc-border'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${dark ? 'translate-x-4' : 'translate-x-0'}`} />
                      </span>
                    </button>
                    <LocaleSwitcher onSwitch={() => setMenuOpen(false)} />
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2.5 text-base text-warm-900 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                    >
                      <Ic d={ICONS.profile} className="w-7 h-7 shrink-0" />
                      แก้ไขโปรไฟล์
                    </Link>
                    <div className="border-t border-warm-200 dark:border-disc-border my-1" />
                    <button
                      onClick={() => signOut({ callbackUrl: '/' })}
                      className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-base text-red-500 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                    >
                      <Ic d={ICONS.logout} className="w-7 h-7 shrink-0" />
                      ออกจากระบบ
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => signIn('discord', { callbackUrl: pathname })}
              className="inline-flex items-center gap-1.5 bg-brand-orange hover:bg-brand-orange-light text-white font-semibold px-3.5 py-2 rounded-lg transition-colors text-sm"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
              </svg>
              เข้าสู่ระบบ
            </button>
          )}
        </div>
      </div>
    </nav>
    <DebugRoleBanner isAdmin={userIsAdmin} />
    </>
  )
}
