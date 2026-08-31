'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import useCaseAutosave from './useCaseAutosave.js'
import CaseSaveBadge from './CaseSaveBadge.jsx'

const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-2.5 text-base placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text'

/**
 * การ์ดผู้ร้องเรียน (PII) — autosave ทุกช่อง
 *
 * ⚠️ ปุ่ม "ส่ง SMS ซ้ำ" ไม่ใช่ checkbox แบบเดิมอีกแล้ว: autosave เซฟเบอร์ลง DB ไปก่อนเสมอ
 *    checkbox ที่ผูกกับ "รอบที่เบอร์เปลี่ยน" จึงไม่มีจังหวะให้ติ๊กทัน → เปลี่ยนเป็นปุ่มแยก
 *    ที่ยิง PATCH { resend_sms: true } เดี่ยวๆ (ดู branch ใน app/api/case/[ref]/route.js)
 */
export default function CaseComplainantEditor({ refId, canEdit, initial, smsEnabled }) {
  const t = useTranslations('case')
  const [smsBusy, setSmsBusy] = useState(false)
  const [smsMsg, setSmsMsg] = useState('')
  const [smsError, setSmsError] = useState('')

  const validate = useCallback((payload) => {
    if ('complainant_name' in payload && !payload.complainant_name.trim()) return t('edit.nameRequired')
    // เบอร์ที่ยังพิมพ์ไม่ครบ = อย่ายิงให้โดน 400 รัวๆ ระหว่างพิมพ์ (server เช็คซ้ำอีกชั้นอยู่แล้ว)
    if ('complainant_phone' in payload && payload.complainant_phone.replace(/\D/g, '').length < 9) {
      return t('edit.phoneInvalid')
    }
    return ''
  }, [t])

  const { values, set, saveState, error, isDirty } = useCaseAutosave({
    refId, canEdit, validate,
    initial: {
      complainant_name: initial.complainant_name || '',
      complainant_phone: initial.complainant_phone || '',
      complainant_line_id: initial.complainant_line_id || '',
    },
  })

  // เบอร์ใหม่ที่ลง DB แล้ว = คนที่ถูกต้องยังไม่เคยได้ลิงก์ติดตาม (SMS เดิมไปเบอร์เก่า)
  const phoneMoved = values.complainant_phone !== (initial.complainant_phone || '') && !isDirty('complainant_phone')

  async function resendSms() {
    setSmsBusy(true)
    setSmsError('')
    setSmsMsg('')
    try {
      const res = await fetch(`/api/case/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend_sms: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.smsSent) { setSmsError(d.error || t('edit.smsFailed')); return }
      setSmsMsg(t('edit.smsSent'))
    } catch {
      setSmsError(t('edit.smsFailed'))
    } finally {
      setSmsBusy(false)
    }
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted">{t('manage.complainantHeading')}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-base">
          <dt className="text-gray-400 dark:text-disc-muted">{t('manage.nameLabel')}</dt>
          <dd className="text-gray-900 dark:text-disc-text">{initial.complainant_name || '—'}</dd>
          <dt className="text-gray-400 dark:text-disc-muted">{t('manage.phoneLabel')}</dt>
          <dd className="text-gray-900 dark:text-disc-text">{initial.complainant_phone || '—'}</dd>
          {initial.complainant_line_id && (<>
            <dt className="text-gray-400 dark:text-disc-muted">LINE</dt>
            <dd className="text-gray-900 dark:text-disc-text">{initial.complainant_line_id}</dd>
          </>)}
        </dl>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted">{t('manage.complainantHeading')}</h2>
        <CaseSaveBadge saveState={saveState} error={error} />
      </div>

      <div>
        <label className={labelCls}>{t('edit.nameLabel')}</label>
        <input className={inputCls} value={values.complainant_name} onChange={e => set('complainant_name', e.target.value)} />
      </div>

      <div>
        <label className={labelCls}>{t('edit.phoneLabel')}</label>
        <input className={inputCls} value={values.complainant_phone} onChange={e => set('complainant_phone', e.target.value)} inputMode="tel" />
        {phoneMoved && smsEnabled && (
          <div className="mt-2 flex flex-col gap-1">
            <button
              onClick={resendSms}
              disabled={smsBusy}
              className="self-start px-3 py-1.5 rounded-lg border border-gray-300 dark:border-disc-border text-sm text-gray-700 dark:text-disc-text hover:border-brand-orange hover:text-brand-orange disabled:opacity-50 transition"
            >
              {smsBusy ? t('edit.smsSending') : t('edit.resendSmsButton')}
            </button>
            {smsMsg && <span className="text-sm text-green-600">{smsMsg}</span>}
            {smsError && <span className="text-sm text-red-500">{smsError}</span>}
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>{t('edit.lineLabel')}</label>
        <input className={inputCls} value={values.complainant_line_id} onChange={e => set('complainant_line_id', e.target.value)} />
      </div>
    </div>
  )
}
