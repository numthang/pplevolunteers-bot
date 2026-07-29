'use client'
import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// แถบบอก/สลับ guild สำหรับหมวด /bot/* เท่านั้น (2026-07-29)
// เหตุผล: หน้าใน /bot/* scope ด้วย guild ไม่ใช่ org — แต่ตัวที่เด่นใน nav คือ org switcher
// ทำให้สลับ org แล้วงงว่าทำไม config ไม่เปลี่ยน (bug-063) → ยก guild switcher มาไว้ตรงที่มันมีผลจริง
// org เดียว 1 guild → แสดงเป็นข้อความเฉยๆ ไม่มี dropdown

function GuildAvatar({ guild, size = 'w-6 h-6' }) {
  if (guild?.icon_url) {
    return <Image src={guild.icon_url} alt="" width={24} height={24} className={`${size} rounded-md object-cover shrink-0`} />
  }
  const letter = (guild?.name || '?').trim().slice(0, 1).toUpperCase()
  return (
    <span className={`${size} rounded-md grid place-items-center text-xs font-bold shrink-0 select-none bg-teal/15 text-teal`}>
      {letter}
    </span>
  )
}

export default function GuildSwitcherBar({ guilds = [], currentGuildId = null }) {
  const t = useTranslations('bot.guildBar')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (!guilds.length) return null

  const current = guilds.find(g => g.guild_id === currentGuildId) || guilds[0]
  const canSwitch = guilds.length > 1

  async function switchGuild(gid) {
    setOpen(false)
    if (gid === currentGuildId) return
    setBusy(true)
    try {
      const res = await fetch('/api/guild/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: gid }),
      })
      // reload เต็มใบ — เหตุผลเดียวกับ org switcher (Router Cache ไม่ล้างด้วย router.refresh())
      if (res.ok) { window.location.reload(); return }
    } catch {}
    setBusy(false)
  }

  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg px-3 py-2">
      {canSwitch ? (
        <div className="relative" ref={ref}>
          <button
            onClick={() => !busy && setOpen(o => !o)}
            disabled={busy}
            aria-label={t('switchAria')}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-warm-100 dark:hover:bg-white/5 transition disabled:opacity-60"
          >
            <GuildAvatar guild={current} />
            <span className="text-sm font-semibold text-warm-900 dark:text-disc-text truncate max-w-[180px]">
              {current?.name}
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
            <div className="absolute left-0 top-full mt-1.5 z-30 w-64 rounded-xl border border-warm-200 dark:border-disc-border bg-white dark:bg-card-bg shadow-lg py-1.5">
              {guilds.map(g => {
                const isActive = g.guild_id === currentGuildId
                return (
                  <button
                    key={g.guild_id}
                    onClick={() => switchGuild(g.guild_id)}
                    className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition ${
                      isActive ? 'bg-teal/10 dark:bg-teal/10' : 'hover:bg-warm-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <GuildAvatar guild={g} size="w-7 h-7" />
                    <span className={`flex-1 min-w-0 truncate ${
                      isActive ? 'text-teal dark:text-teal font-semibold' : 'text-warm-900 dark:text-disc-text font-medium'
                    }`}>
                      {g.name}
                    </span>
                    {isActive && <span className="text-teal shrink-0">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <span className="flex items-center gap-1.5">
          <GuildAvatar guild={current} />
          <span className="text-sm font-semibold text-warm-900 dark:text-disc-text truncate max-w-[180px]">
            {current?.name}
          </span>
        </span>
      )}

      <span className="ml-auto hidden sm:block text-xs text-warm-500 dark:text-disc-muted">{t('hint')}</span>
    </div>
  )
}
