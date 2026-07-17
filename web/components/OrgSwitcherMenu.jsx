'use client'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import CreateOrgModal from './org/CreateOrgModal.jsx'

// DRAFT (2026-07-17) — org switcher แบบ Notion/AppFlowy สำหรับ main nav
// เปิดเมนูได้เสมอแม้มี org เดียว (เมนู = workspace hub: email + รายชื่อ org + สร้าง + จัดการ + ออก)
// TODO(i18n): string ภาษาไทยด้านล่างยัง hardcode — ย้ายเข้า next-intl (ns 'org') ตอน finalize
const T = {
  members:   (n) => `${n} สมาชิก`,
  invited:   'ถูกเชิญ',
  create:    'สร้าง workspace',
  manage:    'จัดการองค์กร / เชิญสมาชิก',
  profile:   'แก้ไขโปรไฟล์',
  logout:    'ออกจากระบบ',
  pick:      'เลือกองค์กร',
}

// letter-avatar โทนสีวนตาม id (on-brand) — fallback สุดท้ายเมื่อ org ไม่มี icon/รูป guild
const TONES = [
  'bg-orange/15 text-orange',
  'bg-teal/15 text-teal',
  'bg-blue-light/50 text-navy dark:text-blue-light',
  'bg-red-accent/15 text-red-accent',
]
function toneFor(id) { return TONES[Math.abs(Number(id) || 0) % TONES.length] }
function isImgSrc(s) { return typeof s === 'string' && (s.startsWith('/') || s.startsWith('http')) }

// ลำดับ fallback: org.icon (รูปที่อัปโหลด / emoji) → iconUrl (รูป guild ที่ยืมมา) → letter
function OrgAvatar({ org, iconUrl, size = 'w-7 h-7' }) {
  const icon = org?.icon
  if (isImgSrc(icon)) {
    return <Image src={icon} alt="" width={32} height={32} className={`${size} rounded-md object-cover shrink-0`} />
  }
  if (icon) {
    return <span className={`${size} rounded-md grid place-items-center text-lg shrink-0 select-none bg-warm-100 dark:bg-white/5`}>{icon}</span>
  }
  if (iconUrl) {
    return <Image src={iconUrl} alt="" width={32} height={32} className={`${size} rounded-md object-cover shrink-0`} />
  }
  const letter = (org?.name || '?').trim().slice(0, 1).toUpperCase()
  return (
    <span className={`${size} rounded-md grid place-items-center text-sm font-bold shrink-0 select-none ${toneFor(org?.id)}`}>
      {letter}
    </span>
  )
}

export default function OrgSwitcherMenu({ orgs = [], activeOrgId, user, activeIconUrl = null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const active = orgs.find(o => o.id === activeOrgId) || orgs[0] || null

  async function switchOrg(id) {
    setOpen(false)
    if (id === activeOrgId) return
    setBusy(true)
    try {
      const res = await fetch('/api/org/orgs/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: id }),
      })
      if (res.ok) { window.dispatchEvent(new Event('guild-switched')); router.refresh() }
    } catch {}
    setBusy(false)
  }

  const itemBase = 'w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition'
  const actionCls = `${itemBase} text-warm-700 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-white/5`

  return (
    <div className="relative shrink-0 flex items-center" ref={ref}>
      {/* icon = กลับหน้าแรก / (เหมือนเดิม) */}
      <Link href="/" aria-label="หน้าแรก" className="rounded-lg p-0.5 hover:bg-warm-100 dark:hover:bg-disc-hover transition">
        <OrgAvatar org={active} iconUrl={activeIconUrl} size="w-8 h-8" />
      </Link>
      {/* ชื่อ + chevron = เปิดเมนู workspace */}
      <button
        onClick={() => !busy && setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg pl-1 pr-1.5 py-1 hover:bg-warm-100 dark:hover:bg-disc-hover transition disabled:opacity-60"
      >
        <span className="hidden md:block font-bold text-base text-teal dark:text-teal truncate max-w-[160px]">
          {active?.name || T.pick}
        </span>
        {busy ? (
          <svg className="w-4 h-4 animate-spin text-warm-400 dark:text-disc-muted" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
               className={`w-4 h-4 text-warm-400 dark:text-disc-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-72 rounded-xl border border-warm-200 dark:border-disc-border bg-white dark:bg-card-bg shadow-lg py-1.5">
          {/* email/account header */}
          <div className="px-3 pb-1.5 pt-1 text-xs text-warm-400 dark:text-disc-muted truncate">
            {user?.email || user?.name || ''}
          </div>

          {/* workspace list */}
          {orgs.map(o => {
            const isActive = o.id === activeOrgId
            const isInvited = o.status === 'invited'
            return (
              <button
                key={o.id}
                onClick={() => switchOrg(o.id)}
                className={`${itemBase} ${isActive
                  ? 'bg-teal/10 dark:bg-teal/10'
                  : 'hover:bg-warm-100 dark:hover:bg-white/5'}`}
              >
                <OrgAvatar org={o} iconUrl={isActive ? activeIconUrl : null} size="w-8 h-8" />
                <span className="flex-1 min-w-0">
                  <span className={`block truncate ${isActive ? 'text-teal dark:text-teal font-semibold' : 'text-warm-900 dark:text-disc-text font-medium'}`}>
                    {o.name}
                  </span>
                  <span className="block text-xs text-warm-400 dark:text-disc-muted">
                    {isInvited ? T.invited : T.members(o.member_count ?? 0)}
                  </span>
                </span>
                {isActive && <span className="text-teal shrink-0">✓</span>}
              </button>
            )
          })}

          {/* create workspace */}
          <button
            onClick={() => { setOpen(false); setShowCreate(true) }}
            className={`${actionCls} mt-0.5`}
          >
            <span className="w-8 h-8 grid place-items-center rounded-md border border-dashed border-warm-300 dark:border-disc-border text-warm-400 dark:text-disc-muted shrink-0">＋</span>
            <span>{T.create}</span>
          </button>

          <div className="my-1 border-t border-warm-200 dark:border-disc-border" />

          {/* actions — mirror AppFlowy (invite / settings / logout) */}
          <a href="/org/settings" onClick={() => setOpen(false)} className={actionCls}>
            <IconBox d="M18 21a8 8 0 0 0-16 0M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M22 11h-6" />
            <span>{T.manage}</span>
          </a>
          <a href="/profile" onClick={() => setOpen(false)} className={actionCls}>
            <IconBox d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            <span>{T.profile}</span>
          </a>
          <button onClick={() => signOut({ callbackUrl: '/' })} className={`${itemBase} text-red-500 dark:text-red-400 hover:bg-warm-100 dark:hover:bg-white/5`}>
            <IconBox d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            <span>{T.logout}</span>
          </button>
        </div>
      )}

      <CreateOrgModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}

function IconBox({ d }) {
  return (
    <span className="w-8 h-8 grid place-items-center shrink-0">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
        <path d={d} />
      </svg>
    </span>
  )
}
