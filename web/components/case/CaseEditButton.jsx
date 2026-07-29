'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text'

function CaseEditModal({ refId, initial, categories, onClose }) {
  const t = useTranslations('case')
  const router = useRouter()

  const [fields, setFields] = useState({
    title:                initial.title || '',
    category:             initial.category || '',
    detail:               initial.detail || '',
    complainant_name:     initial.complainant_name || '',
    complainant_phone:    initial.complainant_phone || '',
    complainant_line_id:  initial.complainant_line_id || '',
  })
  const [resendSms, setResendSms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }))

  const phoneChanged = fields.complainant_phone !== (initial.complainant_phone || '')

  async function save() {
    const changed = {}
    for (const k of Object.keys(fields)) {
      if (fields[k] !== (initial[k] || '')) changed[k] = fields[k]
    }
    if (Object.keys(changed).length === 0) {
      onClose()
      return
    }
    if (phoneChanged && resendSms) changed.resend_sms = true

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/case/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error || t('common.error'))
      router.refresh()
      if (d.smsSent === true) alert(t('edit.smsSentAlert'))
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card-bg rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-disc-border shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-disc-text">{t('edit.heading')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-disc-text text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label className={labelCls}>{t('edit.titleLabel')}</label>
            <input className={inputCls} value={fields.title} onChange={set('title')} />
          </div>

          <div>
            <label className={labelCls}>{t('edit.categoryLabel')}</label>
            <select className={inputCls} value={fields.category} onChange={set('category')}>
              <option value="">{t('edit.categoryNone')}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('edit.detailLabel')}</label>
            <textarea className={inputCls} rows={5} value={fields.detail} onChange={set('detail')} style={{ resize: 'vertical' }} />
          </div>

          <div>
            <label className={labelCls}>{t('edit.provinceLabel')}</label>
            <p className="text-base text-gray-900 dark:text-disc-text">{initial.province}</p>
            <p className="text-sm text-gray-400 dark:text-disc-muted mt-0.5">{t('edit.provinceLocked')}</p>
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-disc-border">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-disc-muted mb-3 mt-3">{t('edit.complainantSection')}</h3>

            <div className="space-y-4">
              <div>
                <label className={labelCls}>{t('edit.nameLabel')}</label>
                <input className={inputCls} value={fields.complainant_name} onChange={set('complainant_name')} />
              </div>

              <div>
                <label className={labelCls}>{t('edit.phoneLabel')}</label>
                <input className={inputCls} value={fields.complainant_phone} onChange={set('complainant_phone')} />
              </div>

              {phoneChanged && (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-disc-text">
                  <input type="checkbox" checked={resendSms} onChange={e => setResendSms(e.target.checked)} />
                  {t('edit.resendSms')}
                </label>
              )}

              <div>
                <label className={labelCls}>{t('edit.lineLabel')}</label>
                <input className={inputCls} value={fields.complainant_line_id} onChange={set('complainant_line_id')} />
              </div>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-disc-border shrink-0 flex gap-3 justify-end items-center">
          <button onClick={onClose} className="px-4 py-2 text-base text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text transition">
            {t('edit.cancelButton')}
          </button>
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-brand-orange text-white rounded-lg text-base font-semibold hover:bg-brand-orange-light disabled:opacity-50 transition">
            {saving ? t('edit.savingButton') : t('edit.saveButton')}
          </button>
        </div>

      </div>
    </div>
  )
}

export default function CaseEditButton({ refId, initial, categories }) {
  const t = useTranslations('case')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-sm text-gray-500 dark:text-disc-muted hover:text-orange transition">
        {t('edit.button')}
      </button>
      {open && (
        <CaseEditModal refId={refId} initial={initial} categories={categories} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
