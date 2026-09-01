'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import useAutoGrow from '@/lib/useAutoGrow.js'
import useCaseAutosave from './useCaseAutosave.js'
import CaseSaveBadge from './CaseSaveBadge.jsx'

const inputBase = 'w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'

/**
 * หัวข้อ + รายละเอียดเคส — แก้ในหน้าได้เลย (ไม่มีโมดัลแล้ว) · autosave
 *
 * ⚠️ `title` เซฟตอน **blur / Enter** เท่านั้น ห้ามเอาไปรวมกับ debounce
 *    PATCH ที่แตะ title โพสต์แจ้ง "✏️ แก้หัวข้อเคส" ลงเธรด Discord ทุกครั้ง
 *    (app/api/case/[ref]/route.js) — เซฟทุก 800ms = เธรดโดนสแปมตอนพิมพ์
 */
export default function CaseContentEditor({ refId, canEdit, initial, aiSummary }) {
  const t = useTranslations('case')

  const validate = useCallback((payload) => {
    if ('title' in payload && !payload.title.trim()) return t('edit.titleRequired')
    if ('detail' in payload && !payload.detail.trim()) return t('edit.detailRequired')
    return ''
  }, [t])

  const { values, set, saveState, error, flush } = useCaseAutosave({
    refId, canEdit, validate,
    initial: { title: initial.title || '', detail: initial.detail || '' },
    manualKeys: ['title'],
  })

  const detailRef = useAutoGrow(values.detail, canEdit)

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text break-words">
          {initial.title || t('manage.noTitle')}
        </h1>
        <p className="text-base text-gray-900 dark:text-disc-text whitespace-pre-wrap">{initial.detail || '—'}</p>
        {aiSummary && <AiSummary text={aiSummary} label={t('manage.aiSummaryHeading')} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <input
          value={values.title}
          onChange={e => set('title', e.target.value)}
          onBlur={() => flush(['title'])}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
          placeholder={t('edit.titlePlaceholder')}
          className={`${inputBase} h-11 px-3 text-lg font-bold`}
        />
        <div className="pt-2.5"><CaseSaveBadge saveState={saveState} error={error} /></div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text">{t('edit.detailLabel')}</label>
        {/* ⛔ ห้ามใส่ autoGrow(e.target) ใน onChange — useAutoGrowEffect ทำให้แล้ว 1 ครั้งต่อ render */}
        <textarea
          ref={detailRef}
          value={values.detail}
          onChange={e => set('detail', e.target.value)}
          rows={6}
          placeholder={t('edit.detailPlaceholder')}
          className={`${inputBase} px-3 py-2.5 text-base resize-none overflow-hidden min-h-[140px]`}
        />
      </div>

      {aiSummary && <AiSummary text={aiSummary} label={t('manage.aiSummaryHeading')} />}
    </div>
  )
}

function AiSummary({ text, label }) {
  return (
    <div className="pt-3 border-t border-gray-100 dark:border-disc-border">
      <h3 className="text-sm font-semibold text-orange mb-1">{label}</h3>
      <p className="text-sm text-gray-700 dark:text-disc-muted whitespace-pre-wrap">{text}</p>
    </div>
  )
}
