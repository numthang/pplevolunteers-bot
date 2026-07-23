'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

// เปิด/ปิด org-native feature (owner) · optimistic + save ทันทีต่อ toggle
export default function OrgFeatures({ orgId }) {
  const t = useTranslations('org')
  const [features, setFeatures] = useState(null) // null=loading · false=ไม่มีสิทธิ์
  const [enabled, setEnabled] = useState(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/org/orgs/${orgId}/features`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setFeatures(d.features); setEnabled(new Set(d.enabled)) })
      .catch(() => setFeatures(false))
  }, [orgId])

  if (features === null) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('features.loading')}</p>
  if (features === false) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('features.ownerOnly')}</p>

  async function toggle(key) {
    const next = new Set(enabled)
    next.has(key) ? next.delete(key) : next.add(key)
    setEnabled(next); setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${orgId}/features`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: [...next] }),
    })
    setBusy(false)
    setNote(r.ok ? t('features.saveSuccess') : t('features.saveError'))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-disc-muted">{t('features.description')}</p>
      {features.map(f => {
        const on = enabled.has(f.key)
        return (
          <div key={f.key} className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium text-gray-900 dark:text-disc-text">{f.label}</p>
              <p className="text-xs text-gray-400 dark:text-disc-muted">{f.desc}</p>
            </div>
            <button type="button" onClick={() => toggle(f.key)} disabled={busy}
              role="switch" aria-checked={on} aria-label={f.label}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-orange' : 'bg-gray-300 dark:bg-disc-border'}`}>
              <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        )
      })}
      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}
