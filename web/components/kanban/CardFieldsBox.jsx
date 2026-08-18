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
import {
  Calendar, CheckSquare, ChevronDown, Eye, GripVertical, Hash, Link2,
  List, ListChecks, Loader2, Plus, Tags, Trash2, Type,
} from 'lucide-react'
import { FIELD_TYPES } from '@/lib/kanbanFieldValue.js'
import DeleteChoiceDialog from './DeleteChoiceDialog.jsx'
import FieldRow from './FieldRow.jsx'
import TagCombobox from './TagCombobox.jsx'
import ChecklistFieldBox from './ChecklistFieldBox.jsx'

/**
 * แถวจัดการ field — กางในแถวเดิม ไม่ลอยออกนอกกล่อง (กับดักข้อ 1 ของ TagCombobox)
 * ลอกทรงมาจาก OptionEditor ใน TagCombobox.jsx ให้หน้าตาเป็นชุดเดียวกัน
 */
/**
 * แถวแก้ field — กางในแถวเดิม ไม่ลอยออกนอกกล่อง (กับดักข้อ 1 ของ TagCombobox)
 * ทรง: [ช่องชื่อ] [🗑]  — ถังขยะเป็นไอคอนล้วน ไม่มีคำว่า "ลบช่องนี้" (user สั่ง 2026-08-18)
 * ⚠️ จัดลำดับใช้ **ลากที่หมุด ⣿ บนหัวแถว** ไม่ใช่ปุ่ม ↑↓ (user สั่งเปลี่ยน 2026-08-18)
 */
function FieldEditor({ field, t, onRename, onDelete, busy }) {
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
    <div ref={ref} className="mt-1 mb-1 flex items-center gap-1">
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
        aria-label={t('modal.fieldRename')}
        className="flex-1 min-w-0 h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label={t('modal.fieldDelete')}
        title={t('modal.fieldDelete')}
        className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover shrink-0"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
      </button>
    </div>
  )
}

/** ⚠️ ไม่วาดชื่อ field เอง — ชื่ออยู่ที่หัวแถวใน CardFieldsBox ซึ่งคลิกเข้าโหมดแก้ได้ (จุดเดียวทุกชนิด) */
/** ไอคอนประจำชนิด — ให้แถวอ่านง่ายเหมือนหน้า property ของ Notion (ตามภาพที่ user ส่งมา) */
const TYPE_ICON = {
  text: Type, number: Hash, url: Link2, date: Calendar, checkbox: CheckSquare,
  select: List, multi_select: Tags, checklist: ListChecks,
}

function ScalarInput({ field, value, readOnly, onCommit, emptyLabel }) {
  const [local, setLocal] = useState(value ?? '')
  useEffect(() => { setLocal(value ?? '') }, [value])

  // ทรง ghost แบบ Notion — ไม่มีกรอบจนกว่าจะ hover/focus ให้แถวอ่านเป็นตาราง label|ค่า
  const inputClass = 'w-full h-11 px-2 -mx-2 text-base rounded-lg border border-transparent bg-transparent text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover focus:outline-none focus:bg-card-bg focus:border-warm-200 dark:focus:border-disc-border focus:ring-2 focus:ring-teal disabled:opacity-60 transition'

  if (field.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        disabled={readOnly}
        onChange={(e) => onCommit(e.target.checked)}
        aria-label={field.label}
        className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer"
      />
    )
  }

  const commit = () => { if (local !== (value ?? '')) onCommit(local) }
  const onKeyDown = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') setLocal(value ?? '')
  }

  return (
    <div>
      <input
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
        value={local}
        disabled={readOnly}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        placeholder={field.type === 'url' ? 'https://…' : emptyLabel}
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
  const [confirmField, setConfirmField] = useState(null)   // { id, label, impact } — กล่องเลือกซ่อน/ลบถาวร
  const [dragId, setDragId] = useState(null)               // field ที่กำลังลากจัดลำดับ

  const loadHidden = useCallback(async () => {
    try {
      const res = await fetch('/api/kanban/fields?archived=1')
      if (!res.ok) return
      const json = await res.json()
      setHidden(json.fields || [])
    } catch { /* โหลดไม่ได้ = ไม่ต้องโชว์หัวข้อ ไม่ใช่เรื่องคอขาดบาดตาย */ }
  }, [])

  useEffect(() => { if (!readOnly) loadHidden() }, [readOnly, loadHidden])

  /**
   * เปิดกล่อง "ลบช่องข้อมูล" — นับความเสียหายจริงก่อนเปิด แล้วให้เลือกเองว่าซ่อนหรือลบถาวร
   * นับไม่ได้ก็เปิดกล่องต่อ (แค่ไม่มีตัวเลข) ห้ามเงียบแล้วไม่ให้ลบ
   */
  async function askDeleteField(field) {
    onError?.('')
    let impact = null
    try {
      const r = await fetch(`/api/kanban/fields/${field.id}?impact=1`)
      if (r.ok) impact = (await r.json()).impact || null
    } catch { /* ไม่มีตัวเลขก็ยังถามได้ */ }
    setConfirmField({ ...field, impact })
  }

  /**
   * เริ่มลาก — ใช้ **ทั้งแถว** เป็นภาพที่ติดเมาส์ ไม่ใช่ไอคอนหมุดจิ๋วๆ
   * (`draggable` อยู่ที่หมุด เบราว์เซอร์จึงถ่ายภาพแค่หมุดถ้าไม่สั่ง setDragImage เอง)
   *
   * ⚠️ ต้อง `setData` ด้วย ไม่งั้น **Firefox ไม่เริ่มลากเลย** (Chrome ปล่อยผ่าน)
   */
  function onDragStartField(e, fieldId) {
    setDragId(fieldId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(fieldId))   // Firefox บังคับ
    const row = e.currentTarget.closest('[data-field-row]')
    // จับที่ตำแหน่งหมุดพอดี ภาพจะได้ไม่กระโดดไปอยู่มุมซ้ายบนของแถว
    if (row) {
      const r = row.getBoundingClientRect()
      e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top)
    }
  }

  /**
   * ลากจัดลำดับ field — ย้อนได้ (ลากกลับ) จึงไม่มี gate ยศ
   * ส่งลำดับ**เต็มชุด**ไปเสมอ ไม่ใช่ส่งแค่คู่ที่สลับ (แนวเดียวกับ reorder ของตัวเลือก/เช็คลิสต์)
   */
  async function onDropField(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const ids = fields.map((f) => String(f.field_id))
    const from = ids.indexOf(String(dragId))
    const to = ids.indexOf(String(targetId))
    setDragId(null)
    if (from === -1 || to === -1) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)

    onError?.('')
    setBusyId(dragId)
    try {
      const res = await fetch('/api/kanban/fields', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: ids }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('saveFailed')); return }
      onFieldsChanged?.()
    } catch {
      onError?.(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

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
  async function setFieldArchived(fieldId, archived) {
    onError?.('')
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
      setConfirmField(null)
      await loadHidden()
      onFieldsChanged?.()
    } catch {
      onError?.(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  /**
   * ลบถาวร — admin เท่านั้น · ลบได้เลย ไม่ต้องซ่อนก่อน (ลอกแบบ posts)
   * ⚠️ ตัวเลขความเสียหายถูกนับไว้ตั้งแต่ askDeleteField() แล้วโชว์ในกล่อง — นั่นคือกลไกกันพลาด
   *    ไม่ใช่การจำกัดสิทธิ์หรือการบังคับลำดับ
   */
  async function purgeField(field) {
    onError?.('')
    setBusyId(field.id)
    try {
      const res = await fetch(`/api/kanban/fields/${field.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('saveFailed')); return }
      setConfirmField(null)
      setMenuFor(null)
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

  // ⛔ ไม่มีกรอบและไม่มีหัวข้อ "ข้อมูลของทีม" แล้ว (user สั่ง 2026-08-18) —
  //    ของระบบกับ custom field ต่อกันเป็นตารางเดียว คั่นด้วยเส้นบางๆ เท่านั้น
  return (
    <div className="border-t border-warm-200 dark:border-disc-border pt-2 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        {fields.map((f) => {
          // ⭐ ไม่มีปุ่ม "..." แล้ว (user สั่ง 2026-08-18) — **คลิกที่ชื่อ field = เข้าโหมดแก้**
          //    ชื่อถูกยกออกมาจาก ScalarInput/ChecklistFieldBox มาไว้ที่นี่จุดเดียว ทุกชนิดจึงคลิกได้เหมือนกันหมด
          const editing = menuFor === f.field_id
          const TypeIcon = TYPE_ICON[f.type] || Type

          /**
           * แถวเดียว 2 คอลัมน์แบบ Notion/AppFlowy: [หมุด · ไอคอน · ชื่อ] | [ค่า]
           * (user ส่งภาพมาแล้วสั่ง "ลอกได้ลอก" 2026-08-18)
           * ⚠️ จอแคบ (มือถือ ~390px) ต้องพับเป็นบนล่าง — คอลัมน์ซ้ายกว้างคงที่บนจอ 390 = ค่าเหลือที่ไม่พอ
           * ⛔ ชื่อ field อยู่ที่นี่จุดเดียวทุกชนิด · ห้ามให้ ScalarInput/ChecklistFieldBox วาดชื่อเองอีก
           */
          const row = (control) => (
            <FieldRow
              key={f.field_id}
              icon={TypeIcon}
              onDragOver={(e) => { if (dragId) e.preventDefault() }}
              onDrop={() => onDropField(f.field_id)}
              data-field-row
              className={`border-t-2 ${dragId && dragId !== f.field_id ? 'border-dashed border-teal/50' : 'border-transparent'} ${dragId === f.field_id ? 'opacity-40' : ''}`}
              handle={!readOnly && (
                /* หมุดลาก — อยู่หน้าสุดก่อนไอคอนชนิด (user สั่ง 2026-08-18)
                   ลากได้เฉพาะตรงนี้ ไม่ใช่ทั้งแถว ไม่งั้นลากทับการเลือกข้อความในช่องกรอก */
                <span
                  draggable
                  onDragStart={(e) => onDragStartField(e, f.field_id)}
                  onDragEnd={() => setDragId(null)}
                  title={t('modal.fieldDragHint')}
                  className="cursor-grab active:cursor-grabbing text-warm-300 dark:text-disc-muted opacity-0 group-hover:opacity-100 shrink-0"
                >
                  <GripVertical size={14} />
                </span>
              )}
              label={
                <span className="flex items-center gap-1 min-w-0">
                  {readOnly ? (
                    <span className="text-sm text-warm-500 dark:text-disc-muted min-w-0 truncate">{f.label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMenuFor(editing ? null : f.field_id)}
                      title={t('modal.fieldRename')}
                      className="text-left text-sm text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text min-w-0 truncate"
                    >
                      {f.label}
                    </button>
                  )}
                </span>
              }
              footer={editing && (
                <FieldEditor
                  field={{ id: f.field_id, label: f.label }}
                  t={t}
                  busy={busyId === f.field_id}
                  onRename={(label) => renameField(f.field_id, label)}
                  onDelete={() => askDeleteField({ id: f.field_id, label: f.label })}
                />
              )}
            >
              <div className="flex-1 min-w-0">{control}</div>
              {busyId === f.field_id && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted shrink-0" />}
            </FieldRow>
          )

          if (f.type === 'checklist') {
            return row(
              <ChecklistFieldBox
                cardId={cardId}
                fieldId={f.field_id}
                items={f.value || []}
                readOnly={readOnly}
                onItemsChanged={(items) => onFieldValueChanged(f.field_id, items)}
                onError={onError}
                t={t}
              />
            )
          }
          if (f.type === 'select' || f.type === 'multi_select') {
            return row(
              <TagCombobox
                fieldId={f.field_id}
                type={f.type}
                value={f.value || []}
                readOnly={readOnly}
                onCommit={(ids) => commit(f.field_id, ids)}   // คืน promise — TagCombobox ใช้นับ inflight กันค่าหาย
                onError={onError}
                t={t}
              />
            )
          }
          return row(
            <ScalarInput field={f} value={f.value} readOnly={readOnly} emptyLabel={t('modal.fieldEmpty')} onCommit={(v) => commit(f.field_id, v)} />
          )
        })}
      </div>

      {/* ซ่อนอยู่ — ที่เดียวในระบบที่เห็น field ที่ถูกซ่อน (เอากลับ / ลบถาวรได้จากตรงนี้) */}
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
                    onClick={() => setFieldArchived(f.id, false)}
                    className="flex items-center gap-1 text-sm text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text"
                  >
                    <Eye size={14} />
                    {t('modal.fieldUnhide')}
                  </button>
                  {/* admin เท่านั้น — คนอื่นไม่เห็นปุ่มเลย ไม่ใช่กดแล้วเด้ง 403 */}
                  {canPurge && (
                    <button
                      type="button"
                      onClick={() => askDeleteField(f)}
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

      {confirmField && (
        <DeleteChoiceDialog
          t={t}
          heading={t('actions.deleteFieldHeading')}
          title={confirmField.label}
          impact={confirmField.impact
            ? t('actions.fieldImpact', {
                cards: confirmField.impact.cards,
                options: confirmField.impact.options,
                items: confirmField.impact.checklistItems,
              })
            : null}
          hideHint={t('actions.fieldHideHint')}
          hideLabel={t('actions.hide')}
          canPurge={canPurge}
          busy={busyId === confirmField.id}
          onClose={() => setConfirmField(null)}
          onHide={() => setFieldArchived(confirmField.id, true)}
          onPurge={() => purgeField(confirmField)}
        />
      )}
    </div>
  )
}
