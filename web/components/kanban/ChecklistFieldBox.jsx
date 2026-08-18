'use client'

/**
 * ChecklistFieldBox — เช็คลิสต์ 1 field (ตรงสกรีนช็อตที่ user ส่งมา 2026-08-18 รอบเย็น: progress bar + %
 * + ลากจัดลำดับ + ปุ่มซ่อนงานที่เสร็จแล้ว) — การ์ดใบเดียวมีได้หลาย field ชนิดนี้ ผูกด้วย (cardId, fieldId)
 */

import { useState } from 'react'
import { Eye, EyeOff, GripVertical, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react'

export default function ChecklistFieldBox({ cardId, fieldId, fieldLabel, items = [], readOnly, onItemsChanged, onError, t }) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [hideDone, setHideDone] = useState(false)
  const [dragId, setDragId] = useState(null)

  const total = items.length
  const done = items.filter((i) => i.done).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const shown = hideDone ? items.filter((i) => !i.done) : items

  async function call(method, body, query = '') {
    const res = await fetch(`/api/kanban/cards/${cardId}/checklist${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { onError?.(json.error || t('saveFailed')); return null }
    return json
  }

  async function addItem(e) {
    e.preventDefault()
    const text = newText.trim()
    if (!text || adding) return
    setAdding(true)
    const json = await call('POST', { fieldId, text })
    if (json?.item) { onItemsChanged([...items, json.item]); setNewText('') }
    setAdding(false)
  }

  async function toggleDone(item) {
    // ⚠️ ไม่ optimistic — onItemsChanged เรียก onChanged() ของหน้ารายการด้วย ยิง 2 ครั้ง (ก่อน/หลัง await)
    //    แข่งกันเองแล้วรายการ (badge x/y) ค้างค่าเก่าได้ถ้า response สลับลำดับ (เจอจาก browser test)
    //    รอบเดียวหลัง await พอ — การ์ดเช็คลิสต์ 1 ทีไม่มีดีเลย์ที่คนสังเกตออก (แนวเดียวกับโค้ดเดิมก่อนกลับคำ)
    setBusyId(item.id)
    const json = await call('PATCH', { itemId: item.id, done: !item.done })
    if (json?.item) onItemsChanged(items.map((i) => (i.id === item.id ? json.item : i)))
    setBusyId(null)
  }

  async function removeItem(itemId) {
    setBusyId(itemId)
    const json = await call('DELETE', null, `?itemId=${itemId}`)
    if (json) onItemsChanged(items.filter((i) => i.id !== itemId))
    setBusyId(null)
  }

  async function onDropReorder(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const list = [...items]
    const from = list.findIndex((i) => i.id === dragId)
    const to = list.findIndex((i) => i.id === targetId)
    if (from === -1 || to === -1) { setDragId(null); return }
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    onItemsChanged(list)
    setDragId(null)
    await call('PATCH', { fieldId, reorder: list.map((i) => i.id) })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <ListChecks size={16} className="text-warm-500 dark:text-disc-muted shrink-0" />
        <span className="text-sm font-medium text-warm-900 dark:text-disc-text">{fieldLabel}</span>
        {total > 0 && (
          <>
            <div className="flex-1 h-1.5 rounded-full bg-warm-100 dark:bg-disc-hover overflow-hidden">
              <div className="h-full bg-teal transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-warm-400 dark:text-disc-muted shrink-0">{pct}%</span>
            <button
              type="button"
              onClick={() => setHideDone((v) => !v)}
              title={hideDone ? t('modal.checklistShowDone') : t('modal.checklistHideDone')}
              className="p-1 text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text shrink-0"
            >
              {hideDone ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {shown.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 group"
            draggable={!readOnly}
            onDragStart={() => setDragId(item.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropReorder(item.id)}
          >
            {!readOnly && <GripVertical size={14} className="text-warm-300 dark:text-disc-muted cursor-grab shrink-0" />}
            <input
              type="checkbox"
              checked={item.done}
              disabled={readOnly}
              onChange={() => toggleDone(item)}
              className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer shrink-0"
            />
            <span className={`flex-1 text-base ${item.done ? 'line-through text-warm-400 dark:text-disc-muted' : 'text-warm-900 dark:text-disc-text'}`}>
              {item.text}
            </span>
            {busyId === item.id && <Loader2 size={14} className="animate-spin text-warm-400 dark:text-disc-muted shrink-0" />}
            {!readOnly && (
              <button
                onClick={() => removeItem(item.id)}
                aria-label={t('modal.removeItem')}
                title={t('modal.removeItem')}
                className="p-1 rounded text-warm-400 dark:text-disc-muted opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <form onSubmit={addItem} className="mt-1.5 flex gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={t('modal.addItemPlaceholder')}
            maxLength={300}
            className="flex-1 h-9 px-3 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
          />
          <button
            type="submit"
            disabled={adding || !newText.trim()}
            aria-label={t('modal.addItem')}
            title={t('modal.addItem')}
            className="flex items-center gap-1 px-3 rounded-lg bg-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </button>
        </form>
      )}
    </div>
  )
}
