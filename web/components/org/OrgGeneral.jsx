'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

function isImgSrc(s) { return typeof s === 'string' && (s.startsWith('/') || s.startsWith('http')) }

export default function OrgGeneral({ org, myRole }) {
  const t = useTranslations('org')
  const isOwner = myRole === 'owner'
  const [name, setName] = useState(org.name)
  const [icon, setIcon] = useState(org.icon || '')
  const [emoji, setEmoji] = useState(isImgSrc(org.icon) ? '' : (org.icon || ''))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function saveName(e) {
    e.preventDefault(); setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setNote(d.error || t('settings.saveNameError'))
    setNote(t('settings.saveNameSuccess')); window.location.reload()
  }

  async function saveEmoji() {
    setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon: emoji.trim() }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setNote(d.error || t('settings.saveIconError'))
    setIcon(d.org.icon || ''); window.location.reload()
  }

  async function uploadImage(e) {
    const file = e.target.files?.[0]; if (!file) return
    setBusy(true); setNote('')
    const fd = new FormData(); fd.append('file', file)
    const r = await fetch(`/api/org/orgs/${org.id}/icon`, { method: 'POST', body: fd })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setNote(d.error || t('settings.uploadError'))
    setIcon(d.org.icon || ''); window.location.reload()
  }

  async function removeIcon() {
    setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon: '' }),
    })
    setBusy(false)
    if (r.ok) { setIcon(''); setEmoji(''); window.location.reload() }
  }

  const preview = isImgSrc(icon)
    ? <img src={icon} alt="" className="h-16 w-16 rounded-xl object-cover" />
    : icon
      ? <span className="grid h-16 w-16 place-items-center rounded-xl bg-gray-100 text-3xl dark:bg-white/5">{icon}</span>
      : <span className="grid h-16 w-16 place-items-center rounded-xl bg-orange/15 text-2xl font-bold text-orange">{(org.name || '?').trim().slice(0, 1).toUpperCase()}</span>

  return (
    <div className="space-y-6">
      {/* ── ไอคอนองค์กร ── */}
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('settings.iconTitle')}</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-disc-muted">{t('settings.iconDesc')}</p>
        <div className="mt-3 flex items-center gap-4">
          {preview}
          {isOwner && (
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={8}
                  placeholder={t('settings.emojiPlaceholder')}
                  className="w-32 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />
                <button onClick={saveEmoji} disabled={busy}
                  className="rounded-lg bg-orange px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{t('settings.useEmojiButton')}</button>
              </div>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer rounded-lg border border-gray-300 dark:border-disc-border px-3 py-2 text-sm font-medium text-gray-700 dark:text-disc-text hover:bg-gray-100 dark:hover:bg-disc-hover">
                  {t('settings.uploadImageButton')}
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} className="hidden" />
                </label>
                {icon && (
                  <button onClick={removeIcon} disabled={busy} className="text-xs text-red-accent hover:underline">{t('settings.removeIconButton')}</button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── ชื่อองค์กร ── */}
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('settings.nameTitle')}</p>
        {isOwner ? (
          <form onSubmit={saveName} className="mt-2 flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />
            <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{t('settings.saveButton')}</button>
          </form>
        ) : (
          <p className="mt-1 text-gray-900 dark:text-disc-text">{org.name}</p>
        )}
      </section>

      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}
