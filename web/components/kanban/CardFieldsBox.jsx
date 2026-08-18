'use client'

/**
 * CardFieldsBox — กล่อง "ข้อมูลของทีม" ใน CardModal (custom field)
 *
 * แยกกายภาพจากของระบบ (title/detail/due/status ฯลฯ) ตามดีไซน์ md/kanban/CUSTOM-FIELDS.md
 * — Jira พังเพราะแทรกฟิลด์ custom ปนกับของระบบจนหาไม่เจอว่าอันไหนเป็นอันไหน
 *
 * ⛔ ไม่มีหน้าแอดมินแยกอีกต่อไป (เคาะ 2026-08-18 รอบเย็น) — สร้าง field ใหม่/ตัวเลือก/เช็คลิสต์
 *    ทำจากในกล่องนี้ทั้งหมด key ของ field สร้างอัตโนมัติจาก label ไม่ต้องพิมพ์เอง
 *
 * เขียนค่าทันทีตอนออกจากช่อง/เปลี่ยนค่า (เหมือนธงติดปัญหา/ป้าย) — ไม่ผ่าน lockToken
 * เพราะ endpoint ไม่แตะ kanban_cards เลย (ไม่ว่าจะเป็น field value ทั่วไปหรือเช็คลิสต์)
 */

import { useEffect, useState } from 'react'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { FIELD_TYPES } from '@/lib/kanbanFieldValue.js'
import TagCombobox from './TagCombobox.jsx'
import ChecklistFieldBox from './ChecklistFieldBox.jsx'

function ScalarInput({ field, value, readOnly, onCommit }) {
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

function NewFieldForm({ onCreate, creating, t }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [type, setType] = useState('text')

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-warm-400 dark:text-disc-muted hover:text-teal"
      >
        <Plus size={14} /> {t('modal.addField')}
      </button>
    )
  }

  async function submit(e) {
    e.preventDefault()
    const ok = await onCreate({ label: label.trim(), type })
    if (ok) { setLabel(''); setType('text'); setOpen(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('modal.newFieldPlaceholder')}
        maxLength={100}
        required
        className="flex-1 min-w-[8rem] h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
      />
      <div className="relative">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 pl-2 pr-7 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal cursor-pointer appearance-none"
        >
          {FIELD_TYPES.map((ty) => <option key={ty} value={ty}>{t(`fieldsPage.type_${ty}`)}</option>)}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted" />
      </div>
      <button type="submit" disabled={creating} className="flex items-center gap-1 h-9 px-3 rounded-lg bg-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {creating && <Loader2 size={14} className="animate-spin" />} {t('fieldsPage.createButton')}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-9 px-3 rounded-lg border border-warm-200 dark:border-disc-border text-sm text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover">
        {t('fieldsPage.cancelButton')}
      </button>
    </form>
  )
}

export default function CardFieldsBox({ cardId, fields = [], readOnly, onCardChanged, onFieldValueChanged, onFieldAdded, onError, t }) {
  const [busyId, setBusyId] = useState(null)
  const [creating, setCreating] = useState(false)

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

  async function createField({ label, type }) {
    onError?.('')

    // กันสร้างช่องชื่อซ้ำโดยไม่ตั้งใจ (กดพลาด/เน็ตช้ากดซ้ำ) — ช่องลบไม่ได้ ซ่อนได้อย่างเดียว
    // เลยต้องกันตั้งแต่ก่อนสร้าง ไม่ใช่ไปตามลบทีหลัง
    if (fields.some((f) => f.label.trim().toLowerCase() === label.trim().toLowerCase())) {
      onError?.(t('modal.fieldDuplicate', { name: label.trim() }))
      return false
    }

    setCreating(true)
    try {
      const res = await fetch('/api/kanban/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, type }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.field) { onError?.(json.error || t('fieldsPage.createFailed')); return false }

      // ⚠️ ห้ามเรียก load() ของ CardModal ที่นี่ — มันเขียนทับ title/detail/กำหนดส่ง ที่ยังพิมพ์ค้างไม่ได้เซฟ = งานหาย
      //    ต่อ field ใหม่เข้า state ตรงๆ พอ (ของใหม่ยังไม่มีค่าอยู่แล้ว) shape ต้องตรงกับที่ AGG ใน cards.js คืนมา
      const f = json.field
      onFieldAdded?.({
        field_id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        value: ['checklist', 'select', 'multi_select'].includes(f.type) ? [] : null,
      })
      return true
    } catch {
      onError?.(t('fieldsPage.createFailed'))
      return false
    } finally {
      setCreating(false)
    }
  }

  if (!fields.length && readOnly) return null

  return (
    <div className="border border-warm-200 dark:border-disc-border rounded-lg p-4 flex flex-col gap-4">
      <h3 className="text-base font-medium text-warm-900 dark:text-disc-text">{t('modal.teamDataLabel')}</h3>

      {!fields.length && <p className="text-base text-warm-400 dark:text-disc-muted">{t('modal.noTeamFields')}</p>}

      <div className="flex flex-col gap-3">
        {fields.map((f) => {
          if (f.type === 'checklist') {
            return (
              <ChecklistFieldBox
                key={f.field_id}
                cardId={cardId}
                fieldId={f.field_id}
                fieldLabel={f.label}
                items={f.value || []}
                readOnly={readOnly}
                onItemsChanged={(items) => onFieldValueChanged(f.field_id, items)}
                onError={onError}
                t={t}
              />
            )
          }
          if (f.type === 'select' || f.type === 'multi_select') {
            return (
              <div key={f.field_id}>
                <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{f.label}</label>
                <TagCombobox
                  fieldId={f.field_id}
                  type={f.type}
                  value={f.value || []}
                  readOnly={readOnly}
                  onCommit={(ids) => commit(f.field_id, ids)}   // คืน promise — TagCombobox ใช้นับ inflight กันค่าหาย
                  onError={onError}
                  t={t}
                />
              </div>
            )
          }
          return (
            <div key={f.field_id} className="flex items-center gap-2">
              <div className="flex-1">
                <ScalarInput field={f} value={f.value} readOnly={readOnly} onCommit={(v) => commit(f.field_id, v)} />
              </div>
              {busyId === f.field_id && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}
            </div>
          )
        })}
      </div>

      {!readOnly && <NewFieldForm onCreate={createField} creating={creating} t={t} />}
    </div>
  )
}
