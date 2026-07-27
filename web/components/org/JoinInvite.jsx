'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

// landing ของ invite link — โชว์ org แล้วให้กด "เข้าร่วม" (login ก่อนถ้ายังไม่ได้ login)
export default function JoinInvite({ token, loggedIn, org, invalid }) {
  const t = useTranslations('join')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function join() {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/org/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error || t('genericError')); setBusy(false); return }
      window.location.href = '/org'
    } catch {
      setError(t('genericError')); setBusy(false)
    }
  }

  const cardCls = "max-w-md mx-auto mt-16 rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6 text-center shadow-sm"

  if (invalid) {
    return (
      <div className={cardCls}>
        <p className="text-gray-800 dark:text-disc-text">{t(`invalid.${invalid}`)}</p>
        <a href="/org" className="mt-3 inline-block text-sm text-orange underline">{t('backLink')}</a>
      </div>
    )
  }

  return (
    <div className={cardCls}>
      {org.icon
        ? <img src={org.icon} alt="" className="mx-auto mb-3 h-14 w-14 rounded-xl object-cover" />
        : <div className="mx-auto mb-3 h-14 w-14 rounded-xl bg-orange/10 flex items-center justify-center text-orange text-xl font-bold">{org.name?.[0] || '?'}</div>}
      <p className="text-sm text-gray-500 dark:text-disc-muted">{t('invitedTo')}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-disc-text">{org.name}</p>

      {loggedIn ? (
        <button onClick={join} disabled={busy}
          className="mt-5 w-full rounded-lg bg-orange py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {busy ? t('joining') : t('joinButton')}
        </button>
      ) : (
        <a href={`/?callbackUrl=${encodeURIComponent('/join/' + token)}`}
          className="mt-5 block w-full rounded-lg bg-orange py-2.5 text-sm font-semibold text-white hover:opacity-90">
          {t('loginToJoin')}
        </a>
      )}
      {error && <p className="mt-3 text-sm text-red-accent">{error}</p>}
    </div>
  )
}
