'use client'

/**
 * CardFieldsBox — กล่อง "ข้อมูลของทีม" ใน CardModal (custom field ก้อน 2)
 *
 * แยกกายภาพจากของระบบ (title/detail/due/status ฯลฯ) ตามดีไซน์ md/kanban/CUSTOM-FIELDS.md
 * — Jira พังเพราะแทรกฟิลด์ custom ปนกับของระบบจนหาไม่เจอว่าอันไหนเป็นอันไหน
 *
 * เขียนค่าทันทีตอนออกจากช่อง/เปลี่ยนค่า (เหมือนธงติดปัญหา/ป้าย) — ไม่ผ่าน lockToken
 * เพราะ endpoint ไม่แตะ kanban_cards เลย (setCardFieldValue เขียนแค่ kanban_card_field_values)
 */

import { useEffect, useState } from 'react'
import { Loader2, Settings } from 'lucide-react'
import Link from 'next/link'

function FieldInput({ field, value, readOnly, onCommit, t }) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => { setLocal(value ?? '') }, [value])

  const inputClass = 'w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60'

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-base text-warm-900 dark:text-disc-text cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={readOnly}
          onChange={(e) => onCommit(e.target.checked)}
          className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer"
        />
        {field.label}
      </label>
    )
  }

  const commit = () => { if (local !== (value ?? '')) onCommit(local) }
  const onKeyDown = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') setLocal(value ?? '')
  }

  return (
    <div>
      <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{field.label}</label>
      <input
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
        value={local}
        disabled={readOnly}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={field.type === 'url' ? 'https://…' : undefined}
        className={inputClass}
      />
    </div>
  )
}

export default function CardFieldsBox({ cardId, fields = [], readOnly, canManage, onCardChanged, onError, t }) {
  const [busyId, setBusyId] = useState(null)

  if (!fields.length && !canManage) return null

  async function commit(fieldId, value) {
    onError?.('')
    setBusyId(fieldId)
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId, value }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('saveFailed')); return }
      onCardChanged?.(json.card)
    } catch {
      onError?.(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="border border-warm-200 dark:border-disc-border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium text-warm-900 dark:text-disc-text">{t('modal.teamDataLabel')}</h3>
        {canManage && (
          <Link
            href="/kanban/fields"
            className="flex items-center gap-1 text-sm text-warm-400 dark:text-disc-muted hover:text-teal hover:underline"
          >
            <Settings size={14} /> {t('modal.manageFields')}
          </Link>
        )}
      </div>

      {!fields.length ? (
        <p className="text-base text-warm-400 dark:text-disc-muted">{t('modal.noTeamFields')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((f) => (
            <div key={f.field_id} className="flex items-center gap-2">
              <div className="flex-1">
                <FieldInput
                  field={f}
                  value={f.value}
                  readOnly={readOnly}
                  onCommit={(v) => commit(f.field_id, v)}
                  t={t}
                />
              </div>
              {busyId === f.field_id && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
