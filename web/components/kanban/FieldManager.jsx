'use client'

/**
 * FieldManager — ช่องข้อมูลตั้งเองของ org (/kanban/fields) · admin เท่านั้น
 *
 * ลอกโครง LabelManager.jsx ทั้งดุ้น (กฎเดียวกัน — ดีไซน์ md/kanban/CUSTOM-FIELDS.md):
 *   - หน้า **Update** → autosave ห้ามมีปุ่มบันทึก (กฎ CLAUDE.md 2026-07-30) ใช้ป้ายสถานะ + beforeunload แทน
 *   - label/help_text เซฟตอนออกจากช่อง/กด Enter · ซ่อน/เลิกซ่อนเซฟทันที
 *   - ไม่มีปุ่มลบ — ซ่อนอย่างเดียว (ค่าที่การ์ดกรอกไว้แล้วห้ามหายเงียบ)
 *
 * ⛔ key และ type แก้ไม่ได้หลังสร้าง — ไม่มี input ให้แก้ 2 อย่างนี้เลยในหน้านี้ (กันแก้ผิดที่)
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2, Plus } from 'lucide-react'
import { FIELD_TYPES } from '@/lib/kanbanFieldValue.js'

function FieldRow({ field, t, onPatch, busy }) {
  const [label, setLabel] = useState(field.label)
  const [helpText, setHelpText] = useState(field.help_text || '')

  useEffect(() => { setLabel(field.label) }, [field.label])
  useEffect(() => { setHelpText(field.help_text || '') }, [field.help_text])

  const commitLabel = () => {
    const clean = label.trim()
    if (!clean || clean === field.label) { setLabel(field.label); return }
    onPatch(field.id, { label: clean })
  }
  const commitHelpText = () => {
    const clean = helpText.trim()
    if (clean === (field.help_text || '')) return
    onPatch(field.id, { helpText: clean || null })
  }

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-3 flex flex-wrap items-center gap-3">
      <span className="px-3 py-1 text-sm font-mono rounded-full bg-warm-100 dark:bg-disc-hover text-warm-700 dark:text-disc-muted">
        {field.key}
      </span>
      <span className="px-3 py-1 text-sm rounded-full border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-muted">
        {t(`fieldsPage.type_${field.type}`)}
      </span>

      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setLabel(field.label) }}
        maxLength={100}
        title={t('fieldsPage.editLabel')}
        className="flex-1 min-w-[10rem] h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
      />

      <input
        value={helpText}
        onChange={(e) => setHelpText(e.target.value)}
        onBlur={commitHelpText}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setHelpText(field.help_text || '') }}
        placeholder={t('fieldsPage.helpTextPlaceholder')}
        className="flex-1 min-w-[10rem] h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
      />

      <span className="text-base text-warm-500 dark:text-disc-muted">
        {t('fieldsPage.cardCount', { count: field.value_count })}
      </span>

      <button
        onClick={() => {
          if (field.archived_at) { onPatch(field.id, { archived: false }); return }
          if (confirm(t('fieldsPage.confirmHide', { name: field.label, count: field.value_count }))) onPatch(field.id, { archived: true })
        }}
        className="flex items-center gap-1.5 h-11 px-4 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium"
      >
        {field.archived_at ? <Eye size={16} /> : <EyeOff size={16} />}
        {field.archived_at ? t('fieldsPage.unhide') : t('fieldsPage.hide')}
      </button>

      {busy && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}
    </div>
  )
}

function NewFieldForm({ t, onCreate, creating, error }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState('text')
  const [helpText, setHelpText] = useState('')

  async function submit(e) {
    e.preventDefault()
    const ok = await onCreate({ key: key.trim(), label: label.trim(), type, helpText: helpText.trim() })
    if (ok) { setKey(''); setLabel(''); setType('text'); setHelpText(''); setOpen(false) }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-11 px-4 text-base rounded-lg bg-teal text-white font-medium hover:opacity-90 transition"
      >
        <Plus size={16} /> {t('fieldsPage.addNew')}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('fieldsPage.keyLabel')}</label>
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('fieldsPage.keyPlaceholder')}
          maxLength={50}
          required
          className="h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('fieldsPage.labelLabel')}</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('fieldsPage.labelPlaceholder')}
          maxLength={100}
          required
          className="h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('fieldsPage.typeLabel')}</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-11 pl-3 pr-8 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal cursor-pointer"
        >
          {FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{t(`fieldsPage.type_${ty}`)}</option>)}
        </select>
      </div>
      <div className="flex-1 min-w-[10rem]">
        <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('fieldsPage.helpTextLabel')}</label>
        <input
          value={helpText}
          onChange={(e) => setHelpText(e.target.value)}
          placeholder={t('fieldsPage.helpTextPlaceholder')}
          className="w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
        />
      </div>
      <button
        type="submit"
        disabled={creating}
        className="flex items-center gap-1.5 h-11 px-4 text-base rounded-lg bg-teal text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
      >
        {creating && <Loader2 size={16} className="animate-spin" />} {t('fieldsPage.createButton')}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-11 px-4 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium"
      >
        {t('fieldsPage.cancelButton')}
      </button>
      {error && <p className="w-full text-base text-red-500 dark:text-red-400">{error}</p>}
    </form>
  )
}

export default function FieldManager() {
  const t = useTranslations('kanban')

  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [createError, setCreateError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const saving = busyId !== null || creating

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/kanban/fields?view=manage')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(res.status === 403 ? t('fieldsPage.adminOnly') : (json.error || t('loadFailed'))); return }
      setFields(json.fields || [])
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!saving) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saving])

  async function patch(fieldId, body) {
    setSaveError('')
    setBusyId(fieldId)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveError(json.error || t('saveFailed')); return }
      setSavedAt(Date.now())
      await load()
    } catch {
      setSaveError(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  async function create({ key, label, type, helpText }) {
    setCreateError('')
    setCreating(true)
    try {
      const res = await fetch('/api/kanban/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, label, type, helpText }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(res.status === 409 ? t('fieldsPage.duplicateKey') : (json.error || t('fieldsPage.createFailed')))
        return false
      }
      setSavedAt(Date.now())
      await load()
      return true
    } catch {
      setCreateError(t('fieldsPage.createFailed'))
      return false
    } finally {
      setCreating(false)
    }
  }

  const active = fields.filter((f) => !f.archived_at)
  const hidden = fields.filter((f) => f.archived_at)

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('fieldsPage.title')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('fieldsPage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="flex items-center gap-1.5 text-base text-warm-500 dark:text-disc-muted">
              <Loader2 size={16} className="animate-spin" /> {t('fieldsPage.saving')}
            </span>
          ) : savedAt ? (
            <span className="text-base text-warm-500 dark:text-disc-muted">{t('fieldsPage.saved')}</span>
          ) : null}
          <Link
            href="/kanban"
            className="flex items-center gap-1.5 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2"
          >
            <ArrowLeft size={16} />
            {t('fieldsPage.backLink')}
          </Link>
        </div>
      </div>

      {loadError && <p className="text-base text-red-500 dark:text-red-400">{loadError}</p>}
      {saveError && <p className="text-base text-red-500 dark:text-red-400">{saveError}</p>}

      {!loadError && <NewFieldForm t={t} onCreate={create} creating={creating} error={createError} />}

      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {t('loading')}
        </div>
      ) : !loadError && active.length === 0 && hidden.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {t('fieldsPage.empty')}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {active.map((f) => (
              <FieldRow key={f.id} field={f} t={t} onPatch={patch} busy={busyId === f.id} />
            ))}
          </div>

          {hidden.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">{t('fieldsPage.hiddenSection')}</h2>
              <p className="text-base text-warm-500 dark:text-disc-muted">{t('fieldsPage.hiddenNote')}</p>
              <div className="flex flex-col gap-2 opacity-60">
                {hidden.map((f) => (
                  <FieldRow key={f.id} field={f} t={t} onPatch={patch} busy={busyId === f.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
