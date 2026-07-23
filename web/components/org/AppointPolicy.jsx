'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

// owner ตั้งค่าว่าบทบาทไหนแต่งตั้งคนอื่นได้บ้าง (นอกจาก owner+admin ที่ได้เสมอ)
// self-gating: GET 403 (ไม่ใช่ owner) → render null
export default function AppointPolicy({ orgId }) {
  const t = useTranslations('org')
  const [roles, setRoles] = useState(null) // null=loading · false=ไม่มีสิทธิ์
  const [selected, setSelected] = useState(new Set())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/org/orgs/${orgId}/appoint-policy`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setRoles(d.roles); setSelected(new Set(d.policy)) })
      .catch(() => setRoles(false))
  }, [orgId])

  if (!roles) return null

  function toggle(k) {
    setNote('')
    setSelected(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  }

  async function save() {
    setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${orgId}/appoint-policy`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: [...selected] }),
    })
    const d = await r.json().catch(() => ({})); setBusy(false)
    setNote(r.ok ? t('appointPolicy.saveSuccess') : (d.error || t('appointPolicy.saveError')))
  }

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
      <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('appointPolicy.title')}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-disc-muted">{t('appointPolicy.desc')}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {roles.map(role => {
          const on = selected.has(role.key)
          return (
            <button key={role.key} onClick={() => toggle(role.key)}
              className={`rounded-full px-2.5 py-1 text-xs border ${
                on
                  ? 'bg-orange text-white border-orange'
                  : 'bg-transparent text-gray-600 dark:text-disc-muted border-gray-300 dark:border-disc-border hover:border-orange'
              }`}>
              {role.label}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{t('appointPolicy.saveButton')}</button>
        {note && <span className="text-xs text-gray-500 dark:text-disc-muted">{note}</span>}
      </div>
    </section>
  )
}
