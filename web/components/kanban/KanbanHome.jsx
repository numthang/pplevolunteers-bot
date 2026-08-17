'use client'

/**
 * KanbanHome — หน้าเดียวของโมดูลการบ้าน (`/kanban`)
 *
 * ⭐ **2026-08-18 ยุบ 2 หน้าเป็นหน้าเดียว** (user เคาะ) — เดิมมี `/kanban` (ลิสต์ของฉัน) กับ `/kanban/board` (กระดานทั้ง org)
 *    ซ้ำซ้อนจริง: การ์ดคนละหน้าตา · โหลดข้อมูล 2 ชุด · ตัวกรอง/ปุ่มเพิ่มงานมีข้างเดียว · ต้องสอนว่ามี 2 หน้า
 *    สิ่งที่ผู้ใช้เลือกตอนนี้ไม่ใช่ "หน้าไหน" แต่เป็น 2 ปุ่ม: **เห็นของใคร** กับ **กองตามอะไร**
 *
 *    ⚠️ KANBAN.md เคยเขียนว่า "ห้ามให้กระดานกลืนหน้าแรก" — เหตุผลเดิมคือกระดานบนมือถือ = ปัดแนวนอน
 *    ข้อนั้นยังยืนอยู่และแก้ที่ **layout** แล้ว: จอ xl วาดกองเป็นคอลัมน์ · จอเล็กวาดกองซ้อนลงมา
 *    (ไม่มีปัดแนวนอนที่ไหนเลย) และตัวกรองตั้งต้น = "ของฉัน" → เปิดมายังเห็นงานตัวเองก่อนเหมือนเดิม
 *
 * ⚠️ ลากด้วย HTML5 DnD = เดสก์ท็อปเท่านั้น และ **ลากได้เฉพาะโหมด "ตามสถานะ"**
 *    (โหมดกำหนดส่งลากแล้วกำกวม — เลื่อน due? เปลี่ยนสถานะ? → ปิดไปเลย)
 *
 * ⛔ เคยลองซ่อนช่อง "กรุ" + กรอง "เสร็จ" เหลือ 7 วัน เพื่อให้พอดีจอ — **user ไม่เอา** (2026-08-17)
 *    "ผมมีปัญหากับการใส่อะไรแล้วไม่ฟิตหน้าจอพอดี" → แก้ที่ layout ไม่ใช่ซ่อนข้อมูล · อย่าเอากลับมาใส่อีก
 * ⚠️ ห้ามทำแถบสีหัวกองด้วย border-t-<สี> — `dark:border-disc-border` ทับสีขอบบนทิ้งในดาร์กโหมด
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Plus, X, Clock, User, ListChecks, AlertTriangle, Tag,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react'
import { STATUS_TYPES } from '@/lib/kanbanAccess.js'
import { columnHeadProps, chipProps } from '@/lib/kanbanLabelColors.js'
import { groupCards, sortCards, isMyCard } from '@/lib/kanbanGrouping.js'
import { collectFilterGroups, filterCards } from '@/lib/kanbanLabelFilter.js'
import CardModal from './CardModal.jsx'
import LabelChips from './LabelChips.jsx'

// แสดงต่อกองสูงสุดเท่านี้ — กอง "เสร็จ" โตไม่มีเพดาน ไม่ควรวาดหมดทุกใบ
const MAX_PER_COLUMN = 40

// ความสำคัญ — เก็บเป็นตัวเลขที่ API รับตรงๆ (ไม่มี enum ฝั่ง DB) ป้ายมาจาก t()
const PRIORITY_OPTIONS = [
  { value: 0, key: 'priorityNormal' },
  { value: 1, key: 'priorityHigh' },
  { value: 2, key: 'priorityUrgent' },
]

function dueState(dueAt) {
  if (!dueAt) return 'none'
  const due = new Date(dueAt)
  const now = new Date()
  if (due.getTime() < now.getTime()) return 'overdue'
  if (due.toDateString() === now.toDateString()) return 'today'
  return 'upcoming'
}

const fmtDueShort = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })

/** ปุ่มสลับแบบ segmented — ใช้ทั้งแถว "แสดง" และ "จัดกลุ่ม" ให้หน้าตาเป็นชุดเดียวกัน */
function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-2 text-base font-medium transition ${
            value === o.value
              ? 'bg-teal text-white'
              : 'text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function KanbanCard({ card, t, onOpen, onDragStart, dragging, draggable, onClaim, claiming }) {
  const state = dueState(card.due_at)
  const total = Number(card.checklist_total) || 0
  const done = Number(card.checklist_done) || 0

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, card)}
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(card) } }}
      className={`bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-teal focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      {/* ไม่มีรหัส K-42 บนหน้าการ์ด — ดูที่หัว CardModal (ยังใช้อ้างถึงการบ้านในดิสฯ อยู่) */}
      <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text line-clamp-2">{card.title}</h3>

      {/* ชื่อกลุ่มไม่ต้องขึ้น — การ์ดในคอลัมน์แคบเกิน (ชื่อกลุ่มเต็มอยู่ใน tooltip ของชิป) */}
      <LabelChips labels={card.labels} showGroupName={false} max={3} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warm-500 dark:text-disc-muted">
        {card.due_at && (
          <span className={`flex items-center gap-1 ${
            state === 'overdue' ? 'text-red-500 font-medium' : state === 'today' ? 'text-orange font-medium' : ''
          }`}>
            <Clock size={16} /> {fmtDueShort(card.due_at)}
          </span>
        )}
        {card.owner_name && (
          <span className="flex items-center gap-1 min-w-0">
            <User size={16} /> <span className="truncate max-w-[9rem]">{card.owner_name}</span>
          </span>
        )}
        {total > 0 && (
          <span className="flex items-center gap-1"><ListChecks size={16} /> {done}/{total}</span>
        )}
        {card.blocked && (
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <AlertTriangle size={16} /> {t('row.blocked')}
          </span>
        )}
      </div>

      {/* งานที่ยังไม่มีเจ้าภาพ = รับได้จากหน้าการ์ดเลย ไม่ต้องเปิดกล่องก่อน
          (กองรอรับโผล่ในตัวกรอง "ของฉัน" อยู่แล้ว — ต้องรับได้ในคลิกเดียว ไม่งั้นก็ค้างเหมือนเดิม) */}
      {!card.owner_user_id && (
        <button
          onClick={(e) => { e.stopPropagation(); onClaim(card) }}
          disabled={claiming}
          className="self-start px-4 py-2 text-base rounded-lg bg-teal hover:opacity-90 text-white font-medium disabled:opacity-50 transition"
        >
          {claiming ? t('actions.claiming') : t('actions.claim')}
        </button>
      )}
    </div>
  )
}

export default function KanbanHome() {
  const t = useTranslations('kanban')

  const [cards, setCards] = useState([])
  const [viewerUserId, setViewerUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [openCardId, setOpenCardId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  // พับ/กางรายกอง — มีผลเฉพาะจอต่ำกว่า xl (จอใหญ่เป็นคอลัมน์ กางเสมอ)
  // ค่าที่ไม่ได้กดเอง = auto: กองที่มีการ์ดกางไว้ กองว่างพับเก็บ
  const [openState, setOpenState] = useState({})
  const [claimingId, setClaimingId] = useState(null)

  // 2 ปุ่มควบคุมที่แทนที่การมี 2 หน้า
  const [scope, setScope] = useState('mine')     // 'mine' | 'all' — ตั้งต้นของฉัน
  const [groupBy, setGroupBy] = useState('status') // 'status' | 'due'
  const [labelFilter, setLabelFilter] = useState([])
  const [filterOpen, setFilterOpen] = useState(false)

  // ฟอร์ม "เพิ่มการบ้าน" — inline panel · ไม่ POST จนกว่าจะกดบันทึก (กฎ CLAUDE.md §Create vs Update)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ title: '', detail: '', dueAt: '', priority: 0, assignToMe: true })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch('/api/kanban/cards?view=board')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(json.error || t('loadFailed')); setCards([]); return }
      setCards(json.cards || [])
      setViewerUserId(json.viewerUserId ?? null)
    } catch {
      setLoadError(t('loadFailed'))
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  // beforeunload เตือนถ้ามีข้อความค้างในฟอร์ม create ที่ยังไม่กดบันทึก (ห้าม autosave หน้า Create)
  useEffect(() => {
    if (!formOpen) return
    const hasPending = form.title.trim() || form.detail.trim()
    if (!hasPending) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [formOpen, form.title, form.detail])

  // กรอง → จัดกอง · ลำดับนี้สำคัญ: ชิปกรองต้องสร้างจากการ์ดที่ "เห็นได้ตามขอบเขต" ไม่ใช่ทั้ง org
  const scoped = useMemo(
    () => (scope === 'mine' ? cards.filter((c) => isMyCard(c, viewerUserId)) : cards),
    [cards, scope, viewerUserId]
  )
  const filterGroups = useMemo(() => collectFilterGroups(scoped), [scoped])
  const visible = useMemo(() => filterCards(scoped, labelFilter), [scoped, labelFilter])
  const groups = useMemo(() => groupCards(visible, groupBy), [visible, groupBy])

  const selectedIds = new Set(labelFilter.map((l) => String(l.id)))
  const canDrag = groupBy === 'status'

  function toggleLabelFilter(label) {
    setLabelFilter((prev) => {
      const id = String(label.id)
      return prev.some((l) => String(l.id) === id) ? prev.filter((l) => String(l.id) !== id) : [...prev, label]
    })
  }

  function onDragStart(e, card) {
    if (!canDrag) return
    setDraggingId(card.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(card.id))   // Firefox ไม่เริ่มลากถ้าไม่ setData
  }

  async function moveTo(cardId, statusType) {
    if (!canDrag || !STATUS_TYPES.includes(statusType)) return
    const card = cards.find((c) => String(c.id) === String(cardId))
    if (!card || card.status_type === statusType) return

    setActionError('')
    // ย้ายให้เห็นทันที แล้วค่อยยืนยันกับ server — ผิดเมื่อไหร่เด้งกลับพร้อมเหตุผล (ห้ามเงียบ)
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, status_type: statusType } : c)))

    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusType }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setActionError(json.error || t('board.moveFailed'))
        setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)))
        return
      }
      // server อาจแก้อย่างอื่นด้วย (ย้ายมา backlog = ถอดเจ้าภาพ) → ใช้ของจริงที่คืนมา
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...json.card } : c)))
    } catch {
      setActionError(t('board.moveFailed'))
      setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)))
    }
  }

  /** รับงานที่ยังไม่มีเจ้าภาพ — server ขยับสถานะ backlog → doing ให้เอง (setCardOwner) */
  async function handleClaim(card) {
    setActionError('')
    setClaimingId(card.id)
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.claimFailed')); return }
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...json.card } : c)))
    } catch {
      setActionError(t('actions.claimFailed'))
    } finally {
      setClaimingId(null)
    }
  }

  function closeForm() {
    setFormOpen(false)
    setCreateError('')
    setForm({ title: '', detail: '', dueAt: '', priority: 0, assignToMe: true })
  }

  // ⛔ ปุ่ม "เพิ่มการบ้าน" ห้ามยิง POST — เปิดฟอร์มเท่านั้น POST เกิดตอนกดบันทึกที่นี่
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
          dueAt: form.dueAt || undefined,   // ⚠️ ส่งดิบจาก datetime-local ห้ามแปลงผ่าน toISOString()
          priority: form.priority,
          assignToMe: form.assignToMe,      // API แปลงเป็น userId ของ session เอง
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setCreateError(json.error || t('form.saveFailed')); return }
      closeForm()
      load()
    } catch {
      setCreateError(t('form.saveFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('page.title')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('page.subtitle')}</p>
        </div>
        <button
          onClick={() => { setCreateError(''); setFormOpen(true) }}
          className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2"
        >
          <Plus size={16} />
          {t('addButton')}
        </button>
      </div>

      {/* แถบควบคุม — 2 ปุ่มนี้แทนที่การมี 2 หน้า */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-500 dark:text-disc-muted">{t('controls.showLabel')}</span>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: t('controls.scopeMine') },
              { value: 'all', label: t('controls.scopeAll') },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-warm-500 dark:text-disc-muted">{t('controls.groupLabel')}</span>
          <Segmented
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: 'status', label: t('controls.groupStatus') },
              { value: 'due', label: t('controls.groupDue') },
            ]}
          />
        </div>

        {filterGroups.length > 0 && (
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-4 py-2 text-base rounded-lg border font-medium transition ${
              labelFilter.length
                ? 'border-teal text-teal'
                : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
            }`}
          >
            <Tag size={16} />
            {t('filter.title')}
            {labelFilter.length > 0 && <span>({labelFilter.length})</span>}
          </button>
        )}
      </div>

      {filterOpen && filterGroups.length > 0 && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4 flex flex-col gap-3">
          {filterGroups.map(({ group, labels }) => (
            <div key={group || '_'}>
              {/* ชื่อกลุ่มมาจาก DB — ห้ามแปลผ่าน t() */}
              <p className="text-sm text-warm-400 dark:text-disc-muted mb-1">{group || t('modal.ungrouped')}</p>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const on = selectedIds.has(String(l.id))
                  const tint = chipProps(l)
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLabelFilter(l)}
                      style={on ? tint.style : undefined}
                      className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full font-medium border ${
                        on
                          ? `${tint.className} border-transparent ring-1 ring-teal`
                          : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {l.name}
                      <span className="text-warm-400 dark:text-disc-muted">{l.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-warm-400 dark:text-disc-muted">{t('filter.hint')}</p>
            {labelFilter.length > 0 && (
              <button
                onClick={() => setLabelFilter([])}
                className="flex items-center gap-1 px-4 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium transition"
              >
                <X size={16} /> {t('filter.clear')}
              </button>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        <form
          onSubmit={handleCreate}
          className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-6 flex flex-col gap-4"
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

          <label className="flex items-center gap-2 text-base text-warm-700 dark:text-disc-muted cursor-pointer">
            <input
              type="checkbox"
              checked={form.assignToMe}
              onChange={(e) => setForm((f) => ({ ...f, assignToMe: e.target.checked }))}
              className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer"
            />
            {t('form.assignToMe')}
          </label>

          {createError && <p className="text-base text-red-500 dark:text-red-400">{createError}</p>}

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
              className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 disabled:opacity-50"
            >
              {creating && <Loader2 size={16} className="animate-spin" />}
              {creating ? t('form.saving') : t('form.saveButton')}
            </button>
          </div>
        </form>
      )}

      {loadError && <p className="text-base text-red-500 dark:text-red-400">{loadError}</p>}
      {actionError && <p className="text-base text-red-500 dark:text-red-400">{actionError}</p>}

      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {t('loading')}
        </div>
      ) : (
        // 2 โหมด layout เท่านั้น — **ไม่มีการปัดแนวนอนที่ไหนเลย** (user เกลียดการปัด · เคยทำ snap แบบ Trello แล้วไม่เอา)
        //   xl (≥1280): กองหารความกว้างจอเป็นคอลัมน์
        //   เล็กกว่านั้น: กองเดียวกันซ้อนลงมา กดพับ/กางได้ (แนวเดียวกับ Notion/Linear/Asana บนมือถือ)
        <div className={`flex flex-col gap-3 xl:grid xl:gap-2 ${groupBy === 'due' ? 'xl:grid-cols-5' : 'xl:grid-cols-6'}`}>
          {groups.map(({ key, cards: list }) => {
            const sorted = sortCards(list)
            const shown = sorted.slice(0, MAX_PER_COLUMN)
            const isOpen = openState[key] ?? sorted.length > 0
            const head = groupBy === 'due' ? t(`due.${key}`) : t(`status.${key}`)
            return (
              <div
                key={key}
                onDragOver={(e) => { if (!canDrag) return; e.preventDefault(); setOverColumn(key) }}
                onDragLeave={() => setOverColumn((s) => (s === key ? null : s))}
                onDrop={(e) => {
                  if (!canDrag) return
                  e.preventDefault()
                  setOverColumn(null)
                  setDraggingId(null)
                  moveTo(e.dataTransfer.getData('text/plain'), key)
                }}
                className={`w-full xl:min-w-0 rounded-lg flex flex-col ${
                  overColumn === key ? 'bg-teal/10 dark:bg-teal/15' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenState((s) => ({ ...s, [key]: !isOpen }))}
                  style={columnHeadProps(key).style}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-left rounded-t-lg xl:cursor-default ${columnHeadProps(key).className}`}
                >
                  <h2 className="text-base font-semibold truncate">{head}</h2>
                  <span className="flex items-center gap-1 shrink-0 text-base opacity-70">
                    {sorted.length}
                    {/* ลูกศรมีความหมายเฉพาะตอนพับได้ = จอเล็ก · จอใหญ่กางเสมอเลยซ่อนทิ้ง */}
                    {isOpen
                      ? <ChevronDown size={16} className="xl:hidden" />
                      : <ChevronRight size={16} className="xl:hidden" />}
                  </span>
                </button>

                {/* ไม่มี padding ในกอง — การ์ดชิดขอบพอดีแนวเดียวกับแถบหัวสี (user 2026-08-17)
                    เหลือแค่ช่องไฟระหว่างการ์ด ไม่งั้นการ์ดติดกันเป็นก้อนเดียว */}
                <div className={`${isOpen ? 'flex' : 'hidden'} xl:flex flex-col gap-2 min-h-[4rem] pt-2`}>
                  {shown.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      t={t}
                      draggable={canDrag}
                      onOpen={(c) => setOpenCardId(c.id)}
                      onDragStart={onDragStart}
                      dragging={draggingId === card.id}
                      onClaim={handleClaim}
                      claiming={claimingId === card.id}
                    />
                  ))}
                  {sorted.length > shown.length && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1">
                      {t('board.moreCards', { count: sorted.length - shown.length })}
                    </p>
                  )}
                  {sorted.length === 0 && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-3 text-center">
                      {labelFilter.length ? t('filter.noMatch') : t('board.emptyColumn')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-sm text-warm-400 dark:text-disc-muted">
        {groupBy === 'due' ? t('controls.dueModeNote') : t('board.dragHint')}
      </p>

      {openCardId && (
        <CardModal cardId={openCardId} onClose={() => setOpenCardId(null)} onChanged={load} />
      )}
    </div>
  )
}
