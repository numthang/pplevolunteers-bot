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
 *
 * ⭐ เส้นแบ่งสิทธิ์ (เคาะ 2026-08-18 · ลอก Notion) — **ย้อนได้ = ทุกคน · ย้อนไม่ได้ = admin**
 *   เปลี่ยนชื่อ · ซ่อน · เอากลับ · สร้าง  → ทุกคนใน org (Notion ไม่มีสิทธิ์ราย property เลย)
 *   ลบถาวร                              → admin เท่านั้น และต้องซ่อนไว้ก่อน (2 จังหวะ)
 *   ⛔ ห้ามเอา gate ไปคุมการเปลี่ยนชื่อ/ซ่อน — user ทักแล้วว่า "จำกัดแล้วใช้ยากอีก"
 *
 * ⛔ เมนูจัดการ field ต้องเป็น **inline expand** ห้ามเป็น popover ลอย
 *   (กับดักข้อ 1 ใน TagCombobox.jsx — `absolute left-full` งอกนอกจอจนปุ่มลบกดไม่ได้ทั้ง desktop และมือถือ)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Eye, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { FIELD_TYPES } from '@/lib/kanbanFieldValue.js'
import TagCombobox from './TagCombobox.jsx'
import ChecklistFieldBox from './ChecklistFieldBox.jsx'

/**
 * แถวจัดการ field — กางในแถวเดิม ไม่ลอยออกนอกกล่อง (กับดักข้อ 1 ของ TagCombobox)
 * ลอกทรงมาจาก OptionEditor ใน TagCombobox.jsx ให้หน้าตาเป็นชุดเดียวกัน
 */
function FieldEditor({ field, t, canPurge, onRename, onHide, busy }) {
  const [name, setName] = useState(field.label)
  const ref = useRef(null)

  useEffect(() => { setName(field.label) }, [field.label])
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }) }, [])

  // ⚠️ ต้องรอผลจริงแล้วเด้งกลับถ้าไม่ผ่าน — ไม่งั้นช่องค้างโชว์ชื่อที่ DB ไม่เคยรับ (UI โกหก)
  const commitName = async () => {
    const clean = name.trim()
    if (!clean) { setName(field.label); return }
    if (clean === field.label) return
    const ok = await onRename(clean)
    if (!ok) setName(field.label)
  }

  return (
    <div ref={ref} className="mt-1 p-2 rounded-lg border border-warm-200 dark:border-disc-border flex flex-col gap-2">
      <div>
        <p className="text-xs text-warm-400 dark:text-disc-muted mb-1">{t('modal.fieldRename')}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setName(field.label); e.currentTarget.blur() }
          }}
          maxLength={100}
          className="w-full h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
        />
      </div>
      <button
        type="button"
        onClick={onHide}
        className="flex items-center gap-1.5 w-fit text-sm text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text font-medium"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        {t('modal.fieldHide')}
      </button>
      {/* ลบถาวรอยู่ใต้หัวข้อ "ซ่อนอยู่" เท่านั้น — ที่นี่บอกแค่ว่าต้องซ่อนก่อน ไม่ให้ทางลัดกดพลาด */}
      {canPurge && (
        <p className="text-xs text-warm-400 dark:text-disc-muted">{t('modal.fieldHide')} → {t('modal.fieldPurge')}</p>
      )}
    </div>
  )
}

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

export default function CardFieldsBox({ cardId, fields = [], readOnly, canPurge = false, onCardChanged, onFieldValueChanged, onFieldAdded, onFieldsChanged, onError, t }) {
  const [busyId, setBusyId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [menuFor, setMenuFor] = useState(null)       // field_id ที่กางเมนูจัดการอยู่
  const [hidden, setHidden] = useState([])           // field ที่ซ่อนไว้ (โหลดแยก — card AGG ไม่คืนมาให้)
  const [hiddenOpen, setHiddenOpen] = useState(false)

  const loadHidden = useCallback(async () => {
    try {
      const res = await fetch('/api/kanban/fields?archived=1')
      if (!res.ok) return
      const json = await res.json()
      setHidden(json.fields || [])
    } catch { /* โหลดไม่ได้ = ไม่ต้องโชว์หัวข้อ ไม่ใช่เรื่องคอขาดบาดตาย */ }
  }, [])

  useEffect(() => { if (!readOnly) loadHidden() }, [readOnly, loadHidden])

  /** เปลี่ยนชื่อ field — ทุกคนทำได้ (ย้อนได้) @returns {Promise<boolean>} */
  async function renameField(fieldId, label) {
    onError?.('')
    setBusyId(fieldId)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('saveFailed')); return false }
      onFieldsChanged?.()
      return true
    } catch {
      onError?.(t('saveFailed'))
      return false
    } finally {
      setBusyId(null)
    }
  }

  /** ซ่อน/เอากลับ — ย้อนได้ทั้งคู่ จึงไม่มี gate ยศ · ค่าที่กรอกไว้ไม่เคยถูกแตะ */
  async function setFieldArchived(fieldId, archived, name) {
    onError?.('')
    if (archived && !window.confirm(t('modal.fieldHideConfirm', { name }))) return
    setBusyId(fieldId)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('saveFailed')); return }
      setMenuFor(null)
      await loadHidden()
      onFieldsChanged?.()
    } catch {
      onError?.(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * ลบถาวร — admin เท่านั้น และ field ต้องซ่อนอยู่แล้ว (บังคับ 2 จังหวะ)
   * ⚠️ ต้องนับความเสียหายจริงมาโชว์ก่อนถาม — ตัวเลขคือกลไกกันพลาดแทนการจำกัดสิทธิ์
   */
  async function purgeField(field) {
    onError?.('')
    let impact = { cards: 0, options: 0, checklistItems: 0 }
    try {
      const r = await fetch(`/api/kanban/fields/${field.id}?impact=1`)
      if (r.ok) impact = (await r.json()).impact || impact
    } catch { /* นับไม่ได้ → ยังถามต่อ แค่เลขเป็น 0 */ }

    const ok = window.confirm(t('modal.fieldPurgeConfirm', {
      name: field.label, cards: impact.cards, options: impact.options, items: impact.checklistItems,
    }))
    if (!ok) return

    setBusyId(field.id)
    try {
      const res = await fetch(`/api/kanban/fields/${field.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('saveFailed')); return }
      await loadHidden()
      onFieldsChanged?.()
    } catch {
      onError?.(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

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
          // แถบเครื่องมือต่อ field — ปุ่ม "..." กางเมนูจัดการแบบ inline (ห้าม popover ลอย)
          const tools = readOnly ? null : (
            <div className="flex flex-col">
              <div className="flex justify-end -mb-1">
                <button
                  type="button"
                  onClick={() => setMenuFor(menuFor === f.field_id ? null : f.field_id)}
                  aria-label={t('modal.fieldMenu')}
                  className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text"
                >
                  <MoreHorizontal size={16} />
                </button>
              </div>
              {menuFor === f.field_id && (
                <FieldEditor
                  field={{ id: f.field_id, label: f.label }}
                  t={t}
                  canPurge={canPurge}
                  busy={busyId === f.field_id}
                  onRename={(label) => renameField(f.field_id, label)}
                  onHide={() => setFieldArchived(f.field_id, true, f.label)}
                />
              )}
            </div>
          )

          if (f.type === 'checklist') {
            return (
              <div key={f.field_id}>
                {tools}
              <ChecklistFieldBox
                cardId={cardId}
                fieldId={f.field_id}
                fieldLabel={f.label}
                items={f.value || []}
                readOnly={readOnly}
                onItemsChanged={(items) => onFieldValueChanged(f.field_id, items)}
                onError={onError}
                t={t}
              />
              </div>
            )
          }
          if (f.type === 'select' || f.type === 'multi_select') {
            return (
              <div key={f.field_id}>
                {tools}
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
            <div key={f.field_id}>
              {tools}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <ScalarInput field={f} value={f.value} readOnly={readOnly} onCommit={(v) => commit(f.field_id, v)} />
                </div>
                {busyId === f.field_id && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}
              </div>
            </div>
          )
        })}
      </div>

      {/*
        ซ่อนอยู่ — ที่เดียวในระบบที่เห็น field ที่ถูกซ่อน และที่เดียวที่ลบถาวรได้
        ⛔ ปุ่ม "ลบถาวร" ต้องอยู่ตรงนี้เท่านั้น (บังคับ ซ่อน → ค่อยลบ · ย้อนไม่ได้)
      */}
      {!readOnly && hidden.length > 0 && (
        <div className="border-t border-warm-200 dark:border-disc-border pt-3">
          <button
            type="button"
            onClick={() => setHiddenOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text"
          >
            <ChevronDown size={14} className={hiddenOpen ? '' : '-rotate-90'} />
            {t('modal.fieldHidden', { count: hidden.length })}
          </button>

          {hiddenOpen && (
            <div className="flex flex-col gap-2 mt-2">
              {hidden.map((f) => (
                <div key={f.id} className="flex items-center gap-2 flex-wrap">
                  <span className="flex-1 min-w-0 truncate text-sm text-warm-500 dark:text-disc-muted">{f.label}</span>
                  <button
                    type="button"
                    onClick={() => setFieldArchived(f.id, false, f.label)}
                    className="flex items-center gap-1 text-sm text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text"
                  >
                    <Eye size={14} />
                    {t('modal.fieldUnhide')}
                  </button>
                  {/* admin เท่านั้น — คนอื่นไม่เห็นปุ่มเลย ไม่ใช่กดแล้วเด้ง 403 */}
                  {canPurge && (
                    <button
                      type="button"
                      onClick={() => purgeField(f)}
                      className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600 font-medium"
                    >
                      {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      {t('modal.fieldPurge')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!readOnly && <NewFieldForm onCreate={createField} creating={creating} t={t} />}
    </div>
  )
}
