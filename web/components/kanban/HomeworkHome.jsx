'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, X, Clock, User, ListChecks, AlertTriangle } from 'lucide-react'
import { formatRef } from '@/lib/kanbanAccess.js'
import CardModal from './CardModal.jsx'
import LabelChips from './LabelChips.jsx'

// สี dot ต่อประเภทสถานะ — ตัวอักษรผ่าน t('status.<key>') เสมอ ที่นี่เก็บแค่สี (ไม่ใช่ข้อความ)
const STATUS_DOT = {
  backlog: 'bg-gray-400',
  doing: 'bg-blue-500',
  review: 'bg-amber-500',
  ready: 'bg-purple-500',
  done: 'bg-green-500',
  cancelled: 'bg-gray-300',
}

// ความสำคัญ — เก็บเป็นตัวเลขที่ API รับตรงๆ (ไม่มี enum ฝั่ง DB) ป้ายมาจาก t()
const PRIORITY_OPTIONS = [
  { value: 0, key: 'priorityNormal' },
  { value: 1, key: 'priorityHigh' },
  { value: 2, key: 'priorityUrgent' },
]

function fmtDue(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

// overdue = เลยเวลาที่กำหนดไปแล้ว · today = ยังไม่ถึงเวลาแต่เป็นวันเดียวกับวันนี้
function dueState(dueAt) {
  if (!dueAt) return 'none'
  const due = new Date(dueAt)
  const now = new Date()
  if (due.getTime() < now.getTime()) return 'overdue'
  if (due.toDateString() === now.toDateString()) return 'today'
  return 'upcoming'
}

function HomeworkRow({ card, t, showClaim, onClaim, onDone, onOpen, busy }) {
  const state = dueState(card.due_at)
  const checklistTotal = Number(card.checklist_total) || 0
  const checklistDone = Number(card.checklist_done) || 0

  return (
    <div
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(card) } }}
      className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-3 flex flex-col gap-2 cursor-pointer hover:border-teal focus:outline-none focus:ring-2 focus:ring-teal"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="shrink-0 text-xs text-warm-400 dark:text-disc-muted">{formatRef(card.ref_no)}</span>
          <h3 className="min-w-0 text-base font-semibold text-warm-900 dark:text-disc-text truncate">{card.title}</h3>
        </div>
        <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-warm-500 dark:text-disc-muted">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[card.status_type] || 'bg-gray-400'}`} />
          {t(`status.${card.status_type}`)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-warm-500 dark:text-disc-muted">
        {card.due_at && (
          <span
            className={`flex items-center gap-1 ${
              state === 'overdue' ? 'text-red-500 font-medium' : state === 'today' ? 'text-orange font-medium' : ''
            }`}
          >
            <Clock size={12} />
            {fmtDue(card.due_at)}
            {state === 'overdue' && ` · ${t('row.overdue')}`}
            {state === 'today' && ` · ${t('row.dueToday')}`}
          </span>
        )}
        {card.owner_name && (
          <span className="flex items-center gap-1">
            <User size={12} />
            {card.owner_name}
          </span>
        )}
        {checklistTotal > 0 && (
          <span className="flex items-center gap-1">
            <ListChecks size={12} />
            {checklistDone}/{checklistTotal}
          </span>
        )}
        {card.blocked && (
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <AlertTriangle size={12} />
            {t('row.blocked')}
          </span>
        )}
      </div>

      {/* ป้าย — แถวของตัวเอง ไม่ปนแถว meta (กำหนดส่ง/เจ้าภาพ) ไม่งั้นบรรทัดยาวจนอ่านไม่ออกบนมือถือ */}
      <LabelChips labels={card.labels} />

      <div className="flex justify-end">
        {showClaim ? (
          <button
            onClick={(e) => { e.stopPropagation(); onClaim(card) }}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg bg-teal hover:opacity-90 text-white font-medium disabled:opacity-50"
          >
            {busy ? t('actions.claiming') : t('actions.claim')}
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onDone(card) }}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium disabled:opacity-50"
          >
            {busy ? t('actions.marking') : t('actions.done')}
          </button>
        )}
      </div>
    </div>
  )
}

// กองว่าง = ขึ้นข้อความว่าง ไม่ใช่ซ่อนหัวข้อทั้งกอง (ดีไซน์: อย่าโชว์หัวข้อโล่งๆ แต่ก็อย่าซ่อนจนดูเหมือนหาย)
function Section({ title, emphasize, emptyText, rows, children }) {
  return (
    <div className="space-y-2">
      <h2 className={emphasize ? 'text-lg font-bold text-warm-900 dark:text-disc-text' : 'text-base font-semibold text-warm-900 dark:text-disc-text'}>
        {title}
      </h2>
      {rows.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 text-center text-sm text-warm-400 dark:text-disc-muted">
          {emptyText}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{children}</div>
      )}
    </div>
  )
}

export default function HomeworkHome() {
  const t = useTranslations('kanban')

  const [mine, setMine] = useState([])
  const [helping, setHelping] = useState([])
  const [unassigned, setUnassigned] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyIds, setBusyIds] = useState(new Set())
  const [actionError, setActionError] = useState('')
  const [openCardId, setOpenCardId] = useState(null)   // การ์ดที่เปิด modal อยู่

  // ฟอร์ม "เพิ่มการบ้าน" — เปิดเป็น inline panel เท่านั้น ไม่ POST จนกว่าจะกดบันทึก (กฎ CLAUDE.md §Create vs Update)
  const [formOpen, setFormOpen] = useState(false)
  // assignToMe ตั้งต้น true — เคสปกติที่สุดของหน้านี้คือจดงานของตัวเอง
  // ติ๊กออก = โยนเข้ากอง "ยังไม่มีคนรับ" ให้คนอื่นมารับ
  const [form, setForm] = useState({ title: '', detail: '', dueAt: '', priority: 0, assignToMe: true })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [mineRes, unassignedRes] = await Promise.all([
        fetch('/api/kanban/cards?view=mine'),
        fetch('/api/kanban/cards?view=unassigned'),
      ])
      const mineJson = await mineRes.json().catch(() => ({}))
      const unassignedJson = await unassignedRes.json().catch(() => ({}))
      if (!mineRes.ok || !unassignedRes.ok) {
        setLoadError(t('loadFailed'))
        setMine([]); setHelping([]); setUnassigned([])
        return
      }
      setMine(mineJson.mine || [])
      setHelping(mineJson.helping || [])
      setUnassigned(unassignedJson.cards || [])
    } catch {
      setLoadError(t('loadFailed'))
      setMine([]); setHelping([]); setUnassigned([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadAll() }, [loadAll])

  // beforeunload เตือนถ้ามีข้อความค้างในฟอร์ม create ที่ยังไม่กดบันทึก (กฎ CLAUDE.md — ห้าม autosave หน้า Create)
  useEffect(() => {
    if (!formOpen) return
    const hasPending = form.title.trim() || form.detail.trim()
    if (!hasPending) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [formOpen, form.title, form.detail])

  function openForm() {
    setCreateError('')
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setCreateError('')
    setForm({ title: '', detail: '', dueAt: '', priority: 0, assignToMe: true })
  }

  // ปุ่มนี้ห้ามยิง POST — เปิดฟอร์มเท่านั้น POST เกิดตอนกดบันทึกใน handleCreate
  async function handleCreate(e) {
    e.preventDefault()
    const title = form.title.trim()
    if (!title) { setCreateError(t('form.titleRequired')); return }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/kanban/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          detail: form.detail.trim() || undefined,
          dueAt: form.dueAt || undefined, // ⚠️ ส่งดิบจาก datetime-local ตรงๆ ห้ามแปลงผ่าน toISOString()
          priority: form.priority,
          assignToMe: form.assignToMe,   // API แปลงเป็น userId ของ session เอง — client ไม่ต้องรู้ id ตัวเอง
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setCreateError(json.error || t('form.saveFailed')); return }
      closeForm()
      loadAll()
    } catch {
      setCreateError(t('form.saveFailed'))
    } finally {
      setCreating(false)
    }
  }

  function setBusy(id, on) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (on) next.add(id); else next.delete(id)
      return next
    })
  }

  async function handleClaim(card) {
    setActionError('')
    setBusy(card.id, true)
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.claimFailed')); return }
      loadAll()
    } catch {
      setActionError(t('actions.claimFailed'))
    } finally {
      setBusy(card.id, false)
    }
  }

  async function handleDone(card) {
    setActionError('')
    setBusy(card.id, true)
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusType: 'done' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.doneFailed')); return }
      loadAll()
    } catch {
      setActionError(t('actions.doneFailed'))
    } finally {
      setBusy(card.id, false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('page.title')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('page.subtitle')}</p>
        </div>
        <button
          onClick={openForm}
          className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2"
        >
          <Plus size={16} />
          {t('addButton')}
        </button>
      </div>

      {formOpen && (
        <form
          onSubmit={handleCreate}
          className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4 flex flex-col gap-3"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">{t('form.title')}</h2>
            <button
              type="button"
              onClick={closeForm}
              className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.titleLabel')}</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder={t('form.titlePlaceholder')}
              className="w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.detailLabel')}</label>
            <textarea
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
              placeholder={t('form.detailPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.dueAtLabel')}</label>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
                className="h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.priorityLabel')}</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className="h-11 pl-3 pr-8 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal cursor-pointer"
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{t(`form.${p.key}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-warm-700 dark:text-disc-muted cursor-pointer">
            <input
              type="checkbox"
              checked={form.assignToMe}
              onChange={(e) => setForm((f) => ({ ...f, assignToMe: e.target.checked }))}
              className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer"
            />
            {t('form.assignToMe')}
          </label>

          {createError && <p className="text-sm text-red-500 dark:text-red-400">{createError}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={creating}
              className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50"
            >
              {t('form.cancelButton')}
            </button>
            <button
              type="submit"
              disabled={creating}
              className="bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50"
            >
              {creating ? t('form.saving') : t('form.saveButton')}
            </button>
          </div>
        </form>
      )}

      {loadError && <p className="text-sm text-red-500 dark:text-red-400">{loadError}</p>}
      {actionError && <p className="text-sm text-red-500 dark:text-red-400">{actionError}</p>}

      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-10 text-center text-warm-400 dark:text-disc-muted">
          {t('loading')}
        </div>
      ) : (
        <>
          <Section title={t('sections.mine')} emphasize emptyText={t('empty.mine')} rows={mine}>
            {mine.map((card) => (
              <HomeworkRow key={card.id} card={card} t={t} showClaim={false} onDone={handleDone} onOpen={(c) => setOpenCardId(c.id)} busy={busyIds.has(card.id)} />
            ))}
          </Section>

          <Section title={t('sections.helping')} emptyText={t('empty.helping')} rows={helping}>
            {helping.map((card) => (
              <HomeworkRow key={card.id} card={card} t={t} showClaim={false} onDone={handleDone} onOpen={(c) => setOpenCardId(c.id)} busy={busyIds.has(card.id)} />
            ))}
          </Section>

          <Section title={t('sections.unassigned')} emptyText={t('empty.unassigned')} rows={unassigned}>
            {unassigned.map((card) => (
              <HomeworkRow key={card.id} card={card} t={t} showClaim onClaim={handleClaim} onOpen={(c) => setOpenCardId(c.id)} busy={busyIds.has(card.id)} />
            ))}
          </Section>
        </>
      )}

      {openCardId && (
        <CardModal cardId={openCardId} onClose={() => setOpenCardId(null)} onChanged={loadAll} />
      )}
    </div>
  )
}
