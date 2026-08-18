'use client'

/**
 * TagCombobox — ตัวเลือกของ select/multi_select field (ตรงสกรีนช็อตที่ user ส่งมา 2026-08-18 รอบเย็น)
 *
 * จัดการตัวเลือกทั้งหมด (สร้าง/เปลี่ยนชื่อ/สี/ซ่อน/จัดลำดับ) จาก**ในกล่องนี้เลย** — ไม่มีหน้าแอดมินแยก
 * เหมือนแนวป้ายที่เปิดให้ทุกคนสร้างอยู่แล้ว แค่ตัวเลือกผูกกับ field เดียว ไม่ใช่คำศัพท์กลางทั้ง org
 *
 * ⚠️ options (ตัวเลือกทั้งหมดของ field) กับ value (ที่การ์ดใบนี้เลือกไว้) เป็นคนละชุดข้อมูล —
 *    ต้องยิง GET แยกตอนเปิดกล่องครั้งแรก การ์ด AGG คืนมาแค่ตัวที่เลือกไว้เท่านั้น
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, GripVertical, Loader2, MoreHorizontal, Trash2, X } from 'lucide-react'
import { chipProps, LABEL_PALETTE } from '@/lib/kanbanLabelColors.js'

function OptionMenu({ option, t, onSave, onDelete }) {
  const [name, setName] = useState(option.name)
  useEffect(() => { setName(option.name) }, [option.name])

  const commitName = () => {
    const clean = name.trim()
    if (clean && clean !== option.name) onSave({ name: clean })
  }

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute z-10 left-full ml-1 top-0 w-48 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-col gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        maxLength={60}
        className="w-full h-9 px-2 text-sm rounded-lg border border-teal bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none"
      />
      <div>
        <p className="text-xs text-warm-400 dark:text-disc-muted mb-1">{t('modal.optionColorLabel')}</p>
        <div className="flex flex-wrap gap-1.5">
          {LABEL_PALETTE.map((hex) => (
            <button
              key={hex}
              onClick={() => onSave({ color: hex })}
              style={{ background: hex }}
              className={`w-6 h-6 rounded-full border ${option.color === hex ? 'ring-2 ring-teal border-transparent' : 'border-warm-200 dark:border-disc-border'}`}
            />
          ))}
        </div>
      </div>
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 pt-2 mt-1 border-t border-warm-200 dark:border-disc-border text-sm text-red-500 hover:text-red-600"
      >
        <Trash2 size={14} /> {t('modal.optionDelete')}
      </button>
    </div>
  )
}

export default function TagCombobox({ fieldId, type, value = [], readOnly, onCommit, t }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(null)   // null = ยังไม่โหลด
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [menuFor, setMenuFor] = useState(null)
  const [dragId, setDragId] = useState(null)
  const boxRef = useRef(null)

  const selectedIds = new Set(value.map((v) => String(v.id)))

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setMenuFor(null) } }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function loadOptions() {
    setLoading(true)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}/options`)
      const json = await res.json().catch(() => ({}))
      setOptions(res.ok ? (json.options || []) : [])
    } catch {
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  function openBox() {
    if (readOnly) return
    setOpen(true)
    if (options === null) loadOptions()
  }

  function commitIds(ids) {
    onCommit(ids.map(Number))
  }

  function toggleOption(optId) {
    const id = String(optId)
    if (type === 'select') {
      commitIds(selectedIds.has(id) ? [] : [id])
      setOpen(false)
      return
    }
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    commitIds([...next])
  }

  async function createOption() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.option) return
      setOptions((prev) => [...(prev || []), json.option])
      setQuery('')
      toggleOption(json.option.id)
    } finally {
      setCreating(false)
    }
  }

  async function saveOption(optId, patch) {
    const res = await fetch(`/api/kanban/fields/${fieldId}/options/${optId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok && json.option) {
      setOptions((prev) => (prev || []).map((o) => (String(o.id) === String(optId) ? json.option : o)))
    }
  }

  async function deleteOption(optId) {
    await fetch(`/api/kanban/fields/${fieldId}/options/${optId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    setOptions((prev) => (prev || []).filter((o) => String(o.id) !== String(optId)))
    setMenuFor(null)
    if (selectedIds.has(String(optId))) commitIds([...selectedIds].filter((id) => id !== String(optId)))
  }

  async function onDropReorder(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const list = [...(options || [])]
    const from = list.findIndex((o) => String(o.id) === String(dragId))
    const to = list.findIndex((o) => String(o.id) === String(targetId))
    if (from === -1 || to === -1) { setDragId(null); return }
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setOptions(list)
    setDragId(null)
    await fetch(`/api/kanban/fields/${fieldId}/options`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reorder: list.map((o) => o.id) }),
    })
  }

  const filtered = (options || []).filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
  const exactMatch = (options || []).some((o) => o.name.trim().toLowerCase() === query.trim().toLowerCase())

  return (
    <div ref={boxRef} className="relative">
      {/* ปิดอยู่ = ชิปที่เลือกไว้ + คลิกเพื่อแก้ */}
      <button
        type="button"
        onClick={openBox}
        disabled={readOnly}
        className="w-full min-h-11 px-3 py-1.5 flex flex-wrap items-center gap-1.5 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-left disabled:opacity-60"
      >
        {value.length === 0 && <span className="text-warm-400 dark:text-disc-muted">{t('modal.tagPlaceholder')}</span>}
        {value.map((v) => {
          const tint = chipProps(v)
          return (
            <span key={v.id} style={tint.style} className={`px-2.5 py-0.5 text-sm font-medium rounded-full ${tint.className}`}>
              {v.name}
            </span>
          )
        })}
        {!readOnly && <ChevronDown size={16} className="ml-auto text-warm-400 dark:text-disc-muted shrink-0" />}
      </button>

      {open && (
        <div className="absolute z-10 mt-1 w-full min-w-[16rem] bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !exactMatch && query.trim()) createOption() }}
            placeholder={t('modal.tagSearchPlaceholder')}
            className="w-full h-9 px-2 mb-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
          />
          <p className="text-xs text-warm-400 dark:text-disc-muted px-1 mb-1">{t('modal.tagHint')}</p>

          {loading && <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-2">{t('loading')}</p>}

          <div className="max-h-64 overflow-y-auto flex flex-col gap-0.5">
            {!loading && filtered.map((o) => {
              const on = selectedIds.has(String(o.id))
              const tint = chipProps(o)
              return (
                <div
                  key={o.id}
                  className="relative flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover"
                  draggable
                  onDragStart={() => setDragId(o.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropReorder(o.id)}
                >
                  <GripVertical size={14} className="text-warm-300 dark:text-disc-muted cursor-grab shrink-0" />
                  <button
                    type="button"
                    onClick={() => toggleOption(o.id)}
                    className="flex-1 flex items-center gap-2 text-left"
                  >
                    <span style={tint.style} className={`px-2.5 py-0.5 text-sm font-medium rounded-full ${tint.className}`}>
                      {o.name}
                    </span>
                  </button>
                  {on && <Check size={16} className="text-teal shrink-0" />}
                  <button
                    type="button"
                    onClick={() => setMenuFor(menuFor === o.id ? null : o.id)}
                    className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text shrink-0"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {menuFor === o.id && (
                    <OptionMenu
                      option={o}
                      t={t}
                      onSave={(patch) => saveOption(o.id, patch)}
                      onDelete={() => deleteOption(o.id)}
                    />
                  )}
                </div>
              )
            })}

            {!loading && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={createOption}
                disabled={creating}
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-left text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="opacity-0" />}
                {t('modal.tagCreateOption', { name: query.trim() })}
              </button>
            )}
          </div>

          {value.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2 mt-1 border-t border-warm-200 dark:border-disc-border">
              {value.map((v) => (
                <span key={v.id} className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted">
                  {v.name}
                  <button type="button" onClick={() => toggleOption(v.id)}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
