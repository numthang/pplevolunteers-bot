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
 * ⛔ เคยลองซ่อนช่อง "พักไว้" + กรอง "เสร็จ" เหลือ 7 วัน เพื่อให้พอดีจอ — **user ไม่เอา** (2026-08-17)
 *    "ผมมีปัญหากับการใส่อะไรแล้วไม่ฟิตหน้าจอพอดี" → แก้ที่ layout ไม่ใช่ซ่อนข้อมูล · อย่าเอากลับมาใส่อีก
 * ⚠️ ห้ามทำแถบสีหัวกองด้วย border-t-<สี> — `dark:border-disc-border` ทับสีขอบบนทิ้งในดาร์กโหมด
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Plus, X, Clock, User, ListChecks, MoreHorizontal, Pencil, Copy,
  ChevronDown, ChevronRight, Loader2, ArchiveRestore, Trash2,
  Filter, ArrowUpDown, Settings, Search, Type, Hash, Calendar, ToggleLeft, List, CircleDot, Link2,
} from 'lucide-react'
import { STATUS_TYPES } from '@/lib/kanbanAccess.js'
import { columnHeadProps, chipProps } from '@/lib/kanbanLabelColors.js'
import { groupCards, isMyCard } from '@/lib/kanbanGrouping.js'
import { collectFilterGroups, filterCards, cardTags } from '@/lib/kanbanTagFilter.js'
import { sortCardsBy, collectSortableFields, BUILTIN_SORT_FIELDS } from '@/lib/kanbanSort.js'
import CardModal from './CardModal.jsx'
import DeleteChoiceDialog from './DeleteChoiceDialog.jsx'
import LabelChips from './LabelChips.jsx'
import { ChecklistBar } from './ChecklistFieldBox.jsx'

// แสดงต่อกองสูงสุดเท่านี้ — กอง "เสร็จ" โตไม่มีเพดาน ไม่ควรวาดหมดทุกใบ
const MAX_PER_COLUMN = 40

// ความสำคัญ — เก็บเป็นตัวเลขที่ API รับตรงๆ (ไม่มี enum ฝั่ง DB) ป้ายมาจาก t()
const PRIORITY_OPTIONS = [
  { value: 0, key: 'priorityNormal' },
  { value: 1, key: 'priorityHigh' },
  { value: 2, key: 'priorityUrgent' },
]

// ไอคอนต่อชนิด field ในเมนู "เรียงลำดับ" — status ใช้ไอคอนเดียวกับ text (ไม่มีไอคอนเฉพาะ)
const SORT_TYPE_ICON = {
  text: Type, url: Link2, number: Hash, date: Calendar,
  checkbox: ToggleLeft, select: List, multi_select: List, checklist: ListChecks, status: CircleDot,
}

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

/** ช่องพิมพ์ชื่อการ์ดใหม่ในกอง — Enter สร้าง · ESC/คลิกออกโดยไม่พิมพ์ = ปิด */
function NewCardInline({ t, busy, onCreate, onCancel }) {
  const [title, setTitle] = useState('')

  async function submit(e) {
    e.preventDefault()
    const clean = title.trim()
    if (!clean || busy) return
    const ok = await onCreate(clean)
    if (ok) setTitle('')
  }

  return (
    <form onSubmit={submit} className="bg-card-bg border border-teal rounded-lg p-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        onBlur={() => { if (!title.trim()) onCancel() }}
        placeholder={t('form.titleLabel')}
        maxLength={200}
        disabled={busy}
        className="w-full text-base bg-transparent text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none disabled:opacity-60"
      />
      {busy && <Loader2 size={14} className="animate-spin text-warm-400 dark:text-disc-muted mt-1" />}
    </form>
  )
}

function KanbanCard({ card, t, onOpen, onDragStart, onDragEnd, dragging, draggable, onClaim, claiming, onRestore, restoring, onPurge, purging, canPurge, onDuplicate, onDelete, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(card.title)

  // ปิดเมนูเมื่อคลิกที่อื่น — เมนูลอยทับการ์ดใบอื่น ถ้าไม่ปิดจะค้างซ้อนกันหลายอัน
  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [menuOpen])

  async function commitRename() {
    const clean = draftTitle.trim()
    setRenaming(false)
    if (!clean || clean === card.title) { setDraftTitle(card.title); return }
    const ok = await onRename(card, clean)
    if (!ok) setDraftTitle(card.title)
  }

  const state = dueState(card.due_at)
  // เช็คลิสต์กลายเป็น custom field แล้ว (2026-08-18 รอบเย็น) — การ์ดมีได้หลายเช็คลิสต์ รวมยอดทุกอันเป็นตัวเลขเดียว
  const checklistFields = (card.fields || []).filter((f) => f.type === 'checklist')
  const total = checklistFields.reduce((sum, f) => sum + (f.value || []).length, 0)
  const done = checklistFields.reduce((sum, f) => sum + (f.value || []).filter((i) => i.done).length, 0)

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(card) } }}
      className={`group bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:border-teal focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      {/* ไม่มีรหัส K-42 บนหน้าการ์ด — ดูที่หัว CardModal (ยังใช้อ้างถึงการบ้านในดิสฯ อยู่) */}
      <div className="flex items-start gap-1">
        {renaming ? (
          <input
            autoFocus
            value={draftTitle}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { setDraftTitle(card.title); setRenaming(false) }
            }}
            onBlur={commitRename}
            maxLength={200}
            className="flex-1 min-w-0 text-base font-semibold rounded border border-teal bg-card-bg px-1 text-warm-900 dark:text-disc-text focus:outline-none"
          />
        ) : (
          <h3 className="flex-1 min-w-0 text-base font-semibold text-warm-900 dark:text-disc-text line-clamp-2">{card.title}</h3>
        )}

        {!card.archived_at && !renaming && (
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); setDraftTitle(card.title); setRenaming(true) }}
              aria-label={t('actions.renameTitle')}
              title={t('actions.renameTitle')}
              className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover"
            >
              <Pencil size={14} />
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
                aria-label={t('actions.cardMenu')}
                title={t('actions.cardMenu')}
                className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover"
              >
                <MoreHorizontal size={14} />
              </button>
              {menuOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg py-1"
                >
                  <button
                    onClick={() => { setMenuOpen(false); onDuplicate(card) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover"
                  >
                    <Copy size={14} /> {t('actions.duplicate')}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onDelete(card) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover"
                  >
                    <Trash2 size={14} /> {t('actions.delete')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ชิปมาจากค่าใน custom field แล้ว (ยุบป้ายเข้า field 2026-08-19) — cardTags คือจุดแปลงจุดเดียว
          ชื่อกลุ่มไม่ต้องขึ้น การ์ดในคอลัมน์แคบเกิน (ชื่อ field เต็มอยู่ใน tooltip ของชิป) */}
      <LabelChips labels={cardTags(card)} showGroupName={false} max={3} />

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
            {/* ⛔ ห้าม truncate ชื่อคน (user สั่ง 2026-08-19) — ชื่อยาวขึ้นหลังเปลี่ยนมาใช้ display_name
                เช่น "Tee (ราชบุรี)" · ตัดหัวท้ายแล้วดูไม่ออกว่าใคร ปล่อยให้ตกบรรทัดในการ์ดแทน */}
            <User size={16} className="shrink-0" /> <span>{card.owner_name}</span>
          </span>
        )}
      </div>

      {/* ความคืบหน้าเช็คลิสต์เป็น **แท่ง** ไม่ใช่ตัวเลข x/y (user สั่ง 2026-08-19)
          อยู่บรรทัดของตัวเอง — ยัดในแถว meta แล้วแท่งแคบจนอ่านไม่ออกบนคอลัมน์แคบ
          ตัวเลขจริงย้ายไป title ให้เอาเมาส์ชี้ดูได้ ไม่ได้หายไปเฉยๆ */}
      {total > 0 && (
        <div className="flex items-center gap-1.5 text-warm-500 dark:text-disc-muted" title={`${done}/${total}`}>
          <ListChecks size={16} className="shrink-0" />
          <ChecklistBar done={done} total={total} className="flex-1" />
        </div>
      )}

      {/* อยู่ในกรุ = เอาออก · และ (admin เท่านั้น) ลบถาวร — ที่เดียวในระบบที่ลบการ์ดจริงได้ */}
      {card.archived_at ? (
        <div className="self-start flex flex-wrap items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRestore(card) }}
            disabled={restoring}
            className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium disabled:opacity-50 transition"
          >
            <ArchiveRestore size={16} />
            {restoring ? t('actions.restoring') : t('actions.restore')}
          </button>
          {/* คนที่ไม่ใช่ admin ไม่เห็นปุ่มนี้เลย — ไม่ใช่กดแล้วเด้ง 403 */}
          {canPurge && (
            <button
              onClick={(e) => { e.stopPropagation(); onPurge(card) }}
              disabled={purging}
              className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg border border-red-300 dark:border-red-500/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 font-medium disabled:opacity-50 transition"
            >
              <Trash2 size={16} />
              {purging ? t('actions.purging') : t('actions.purge')}
            </button>
          )}
        </div>
      ) : !card.owner_user_id && (
        /* งานที่ยังไม่มีเจ้าภาพ = รับได้จากหน้าการ์ดเลย ไม่ต้องเปิดกล่องก่อน
           (กองรอทำโผล่ในตัวกรอง "ของฉัน" อยู่แล้ว — ต้องรับได้ในคลิกเดียว ไม่งั้นก็ค้างเหมือนเดิม) */
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
  const [restoringId, setRestoringId] = useState(null)
  const [purgingId, setPurgingId] = useState(null)
  const [confirmCard, setConfirmCard] = useState(null)   // การ์ดที่กำลังถามว่าจะเข้ากรุหรือลบถาวร
  const [archivingId, setArchivingId] = useState(null)
  const [addingIn, setAddingIn] = useState(null)     // กองที่กำลังพิมพ์ชื่อการ์ดใหม่อยู่
  const [creatingIn, setCreatingIn] = useState(null)
  const [canPurge, setCanPurge] = useState(false)   // มาจาก API โหมดกรุ — client ห้ามเดาสิทธิ์ตัวเอง

  // 2 ปุ่มควบคุมที่แทนที่การมี 2 หน้า
  const [scope, setScope] = useState('mine')     // 'mine' | 'all' | 'archived' — ตั้งต้นของฉัน
  const [groupBy, setGroupBy] = useState('status') // 'status' | 'due'
  const [labelFilter, setLabelFilter] = useState([])
  const [helperFilter, setHelperFilter] = useState([])   // user_id (string) ของผู้ช่วยที่ถูกเลือกกรอง
  // dropdown ไหนกำลังกางอยู่ — index ใน filterGroups (ป้าย) หรือ 'helper' (pill ผู้ช่วยท้ายแถว) หรือ null = ปิดหมด
  // (ใช้ index แทนชื่อกลุ่มเพราะกลุ่ม "ไม่มีชื่อ" มีค่าเป็น null อยู่แล้ว ชนกับ sentinel ปิดไม่ได้)
  const [openGroupIdx, setOpenGroupIdx] = useState(null)
  const filterRowRef = useRef(null)
  // แถวชิปตัวกรอง (ป้าย/คนช่วย) ซ่อนไว้เป็นค่าเริ่มต้น — กดไอคอนกรวยเพื่อเปิด (user เคาะ 2026-08-21)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // เมนู "เรียงลำดับ" — null = ค่าเริ่มต้น (กำหนดส่ง→ความสำคัญ→ใหม่ก่อน จาก sortCards เดิม)
  const [sort, setSort] = useState(null)
  const [sortOpen, setSortOpen] = useState(false)
  const [sortQuery, setSortQuery] = useState('')
  const sortBoxRef = useRef(null)

  // dropdown ตัวกรองป้าย — ปิดเมื่อคลิกนอกแถวปุ่ม/กด ESC (ตัวกรองอื่นในโปรเจกต์ก็ใช้ mousedown ไม่ใช่ click
  // เพราะต้องปิดก่อน onClick ของปุ่มอื่นด้านนอกจะยิง) · ครอบทั้งแถวไม่ใช่ต่อปุ่ม เพราะคลิกปุ่มกลุ่มอื่นตอนอันหนึ่ง
  // เปิดอยู่ยังนับว่า "อยู่ในแถว" — onClick ของปุ่มนั้นสลับ openGroupIdx เอง ไม่ต้องพึ่ง outside-click ปิดก่อน
  useEffect(() => {
    if (openGroupIdx === null) return
    function onClickOutside(e) {
      if (filterRowRef.current && !filterRowRef.current.contains(e.target)) setOpenGroupIdx(null)
    }
    function onKey(e) { if (e.key === 'Escape') setOpenGroupIdx(null) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [openGroupIdx])

  // เมนูเรียงลำดับ — กติกาปิดเดียวกับด้านบน
  useEffect(() => {
    if (!sortOpen) return
    function onClickOutside(e) {
      if (sortBoxRef.current && !sortBoxRef.current.contains(e.target)) setSortOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setSortOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortOpen])

  // ฟอร์ม "เพิ่มการบ้าน" — inline panel · ไม่ POST จนกว่าจะกดบันทึก (กฎ CLAUDE.md §Create vs Update)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ title: '', detail: '', dueAt: '', priority: 0, assignToMe: true })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // กรุใช้ endpoint แยก — ของฉัน/ทั้งหมด กรองจากชุดเดียวกันในเครื่อง ไม่ต้องยิงใหม่
  const inArchive = scope === 'archived'

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch(`/api/kanban/cards?view=${inArchive ? 'archived' : 'board'}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(json.error || t('loadFailed')); setCards([]); return }
      setCards(json.cards || [])
      setViewerUserId(json.viewerUserId ?? null)
      // ทั้งกระดานและกรุส่งมา — กระดานก็มีเมนู ⋯ → ลบ แล้ว (ก้อน B)
      setCanPurge(Boolean(json.canPurge))
    } catch {
      setLoadError(t('loadFailed'))
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [t, inArchive])

  // สลับเข้า/ออกกรุ = คนละชุดข้อมูล ต้องโหลดใหม่ · สลับ ของฉัน↔ทั้งหมด ไม่ต้อง (กรองในเครื่อง)
  useEffect(() => { setLoading(true); load() }, [load])

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
    // ในกรุโชว์ทุกใบ ไม่แยกของใคร — ของที่เก็บเข้ากรุแล้วมีไม่เยอะ และคนตามหามักจำไม่ได้ว่าใครเก็บ
    () => (scope === 'mine' ? cards.filter((c) => isMyCard(c, viewerUserId)) : cards),
    [cards, scope, viewerUserId]
  )
  const filterGroups = useMemo(() => collectFilterGroups(scoped), [scoped])
  // ผู้ช่วยที่ "มีอยู่จริง" บนการ์ดที่โหลดมา + จำนวนใบที่ติด — เหตุผลเดียวกับ collectFilterGroups
  // (ไม่เอาทั้ง org มาวาง จะได้ตัวเลือกกดแล้วว่างเปล่าเต็มไปหมด)
  const helperOptions = useMemo(() => {
    const map = new Map()
    for (const c of scoped) {
      for (const h of c.helpers || []) {
        const id = String(h.user_id)
        if (!map.has(id)) map.set(id, { id, name: h.name, count: 0 })
        map.get(id).count++
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [scoped])
  // เมนู "เรียงลำดับ" — builtin คงที่ (แปลผ่าน t) + custom field ที่มีอยู่จริงบนการ์ดที่โหลดมา (ชื่อมาจาก DB ห้ามแปล)
  const sortOptions = useMemo(() => {
    const builtins = BUILTIN_SORT_FIELDS.map((f) => ({
      key: f.key, fieldId: null, type: f.type, label: t(f.labelKey),
    }))
    const customs = collectSortableFields(scoped).map((f) => ({
      key: `field_${f.field_id}`, fieldId: f.field_id, type: f.type, label: f.label,
    }))
    return [...builtins, ...customs]
  }, [scoped, t])
  const filteredSortOptions = useMemo(() => {
    const q = sortQuery.trim().toLowerCase()
    if (!q) return sortOptions
    return sortOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [sortOptions, sortQuery])
  const visible = useMemo(() => {
    const byLabel = filterCards(scoped, labelFilter)
    if (!helperFilter.length) return byLabel
    const wanted = new Set(helperFilter)
    return byLabel.filter((c) => (c.helpers || []).some((h) => wanted.has(String(h.user_id))))
  }, [scoped, labelFilter, helperFilter])
  const groups = useMemo(() => groupCards(visible, groupBy), [visible, groupBy])

  const selectedIds = new Set(labelFilter.map((l) => String(l.id)))
  const selectedHelperIds = new Set(helperFilter)
  // ในกรุลากไม่ได้ — ต้องเอาออกจากกรุก่อนถึงจะขยับสถานะได้ (ไม่งั้นได้การ์ดที่ "เสร็จ" ทั้งที่อยู่ในกรุ)
  const canDrag = groupBy === 'status' && !inArchive

  function toggleLabelFilter(label) {
    setLabelFilter((prev) => {
      const id = String(label.id)
      return prev.some((l) => String(l.id) === id) ? prev.filter((l) => String(l.id) !== id) : [...prev, label]
    })
  }

  function toggleHelperFilter(id) {
    setHelperFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  /**
   * เลือก field ในเมนู "เรียงลำดับ" — วนสามจังหวะ: ยังไม่ได้เลือก → ทิศเริ่มต้น → ทิศตรงข้าม → กลับค่าเริ่มต้น (null)
   * ทิศเริ่มต้นตามชนิด (เข้าใจง่ายกว่าบังคับ asc เสมอ): วันที่/ตัวเลข/เช็คลิสต์ = มาก(ล่าสุด)ก่อน · ที่เหลือ = ก-ฮ/น้อยไปมากก่อน
   * ⚠️ ต้องเทียบกับ "ทิศเริ่มต้นของ type นี้" ไม่ใช่เทียบกับ 'asc' ตรงๆ — ไม่งั้น field ที่เริ่มต้น desc (เช่นวันที่)
   *    จะข้ามจังหวะ "ทิศตรงข้าม" ไปเลย (none→desc→none วนแค่ 2 จังหวะ ไม่ใช่ 3) — เจอจาก Playwright test 2026-08-21
   */
  function chooseSort(opt) {
    setSort((prev) => {
      const defaultDir = ['date', 'number', 'checklist'].includes(opt.type) ? 'desc' : 'asc'
      if (prev?.key !== opt.key) return { ...opt, dir: defaultDir }
      if (prev.dir === defaultDir) return { ...opt, dir: defaultDir === 'asc' ? 'desc' : 'asc' }
      return null
    })
    setSortOpen(false)
    setSortQuery('')
  }

  function onDragStart(e, card) {
    if (!canDrag) return
    setDraggingId(card.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(card.id))   // Firefox ไม่เริ่มลากถ้าไม่ setData
  }

  /** ปล่อยนอกกองหรือกด ESC — ต้องคืนสภาพเอง ไม่งั้นการ์ดค้างจาง + กองค้างไฮไลต์ */
  function onDragEnd() {
    setDraggingId(null)
    setOverColumn(null)
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

  /**
   * ลบการ์ดถาวร — admin เท่านั้น (ปุ่มไม่โผล่ให้คนอื่นด้วยซ้ำ)
   * ⚠️ ไม่ถามเองแล้ว — DeleteChoiceDialog เป็นคนถามและแยกปุ่ม "เข้ากรุ" กับ "ลบถาวร" ให้ชัดอยู่แล้ว
   */
  async function handlePurge(card) {
    setActionError('')
    setPurgingId(card.id)
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}?purge=1`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.purgeFailed')); return }
      setCards((prev) => prev.filter((c) => c.id !== card.id))
      setConfirmCard(null)
    } catch {
      setActionError(t('actions.purgeFailed'))
    } finally {
      setPurgingId(null)
    }
  }

  /** เก็บเข้ากรุจากเมนูบนการ์ด — ย้อนได้ (โหมด "แสดง: กรุ" มีปุ่มเอาออก) */
  async function archiveCard(card) {
    setActionError('')
    setArchivingId(card.id)
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('saveFailed')); return }
      setCards((prev) => prev.filter((c) => c.id !== card.id))
      setConfirmCard(null)
    } catch {
      setActionError(t('saveFailed'))
    } finally {
      setArchivingId(null)
    }
  }

  /** แก้ชื่อจากบนการ์ด (ปุ่มปากกา) — autosave ของ modal ใช้ lockToken แต่ตรงนี้ยิงตรง */
  async function renameCard(card, title) {
    setActionError('')
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockToken: card.lock_token, title }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('saveFailed')); return false }
      setCards((prev) => prev.map((c) => (c.id === card.id ? json.card : c)))
      return true
    } catch {
      setActionError(t('saveFailed'))
      return false
    }
  }

  /** ทำสำเนาจากเมนูบนการ์ด (ย้ายมาจาก CardModal — user สั่ง 2026-08-19) */
  async function duplicateCard(card) {
    setActionError('')
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}/duplicate`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.duplicateFailed')); return }
      await load()
    } catch {
      setActionError(t('actions.duplicateFailed'))
    }
  }

  /**
   * สร้างการ์ดจากในกองเลย (ปุ่ม + บนหัวกอง) — พิมพ์ชื่อแล้ว Enter จบ
   *
   * ⚠️ กองที่ไม่ใช่ "รอทำ" ต้องมีเจ้าภาพ (DB CHECK: ไม่มีเจ้าภาพห้ามออกจาก backlog)
   *    → ใช้ `assignToMe` ที่ API มีอยู่แล้ว = คนกดเป็นเจ้าภาพ
   *    (ตรงกับเจตนา "ฉันกำลังเพิ่มงานที่ขั้นนี้" และเป็นทางลัดเดิมของหน้าการบ้านของฉัน)
   */
  async function createCardIn(statusType, title) {
    setActionError('')
    setCreatingIn(statusType)
    try {
      const res = await fetch('/api/kanban/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          statusType,
          assignToMe: statusType !== 'backlog',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('saveFailed')); return false }
      setAddingIn(null)
      await load()
      return true
    } catch {
      setActionError(t('saveFailed'))
      return false
    } finally {
      setCreatingIn(null)
    }
  }

  /** เอาออกจากกรุ — การ์ดกลับไปกองเดิม แล้วหายจากโหมดกรุทันที */
  async function handleRestore(card) {
    setActionError('')
    setRestoringId(card.id)
    try {
      const res = await fetch(`/api/kanban/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.restoreFailed')); return }
      setCards((prev) => prev.filter((c) => c.id !== card.id))   // ออกจากกรุแล้ว = ไม่อยู่ในรายการนี้อีก
    } catch {
      setActionError(t('actions.restoreFailed'))
    } finally {
      setRestoringId(null)
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
        {/* ในกรุไม่มีปุ่มเพิ่ม — สร้างแล้วการ์ดใหม่จะไม่โผล่ในโหมดนี้ ดูเหมือนกดแล้วไม่เกิดอะไร */}
        {!inArchive && (
          <button
            onClick={() => { setCreateError(''); setFormOpen(true) }}
            className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2"
          >
            <Plus size={16} />
            {t('addButton')}
          </button>
        )}
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
              { value: 'archived', label: t('controls.scopeArchived') },
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

        {/* กรวยกรอง / เรียงลำดับ / เฟือง (ตั้งค่า — ยังไม่ทำ ใส่ไว้ก่อน) — ชิดขวาแถวเดียวกัน */}
        <div className="flex items-center gap-1.5 ml-auto">
          {(filterGroups.length > 0 || helperOptions.length > 0) && (
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              title={t('filter.toggleLabel')}
              aria-label={t('filter.toggleLabel')}
              className={`flex items-center justify-center h-9 w-9 rounded-lg border transition ${
                filtersOpen || labelFilter.length > 0 || helperFilter.length > 0
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
              }`}
            >
              <Filter size={16} />
            </button>
          )}

          <div ref={sortBoxRef} className="relative">
            <button
              onClick={() => setSortOpen((v) => !v)}
              title={t('sort.toggleLabel')}
              aria-label={t('sort.toggleLabel')}
              className={`flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-sm font-medium transition ${
                sort
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
              }`}
            >
              <ArrowUpDown size={16} />
              {sort && <span className="max-w-[140px] truncate">{t('sort.active', { label: sort.label })}</span>}
            </button>

            {sortOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2">
                <div className="flex items-center gap-1.5 h-9 px-2 mb-1.5 rounded-lg border border-warm-200 dark:border-disc-border">
                  <Search size={14} className="text-warm-400 dark:text-disc-muted shrink-0" />
                  <input
                    autoFocus
                    value={sortQuery}
                    onChange={(e) => setSortQuery(e.target.value)}
                    placeholder={t('sort.searchPlaceholder')}
                    className="flex-1 min-w-0 bg-transparent text-sm text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto flex flex-col">
                  {filteredSortOptions.length === 0 && (
                    <p className="px-2 py-3 text-sm text-warm-400 dark:text-disc-muted text-center">{t('sort.noOptions')}</p>
                  )}
                  {filteredSortOptions.map((opt) => {
                    const Icon = SORT_TYPE_ICON[opt.type] || Type
                    const active = sort?.key === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => chooseSort(opt)}
                        className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left ${
                          active
                            ? 'bg-teal/10 text-teal font-medium'
                            : 'text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                        }`}
                      >
                        <Icon size={14} className="shrink-0" />
                        <span className="flex-1 truncate">{opt.label}</span>
                        {active && <span className="text-xs shrink-0">{sort.dir === 'desc' ? '↓' : '↑'}</span>}
                      </button>
                    )
                  })}
                </div>

                {sort && (
                  <button
                    onClick={() => { setSort(null); setSortOpen(false) }}
                    className="w-full mt-1.5 h-8 text-sm text-warm-500 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 rounded-md hover:bg-warm-50 dark:hover:bg-disc-hover"
                  >
                    {t('sort.clear')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* เฟือง = ที่ตั้งค่าเผื่ออนาคต ยังไม่มีฟังก์ชัน — ใส่ไว้ก่อนตามที่ user ขอ */}
          <button
            disabled
            title={t('settings.toggleLabel')}
            aria-label={t('settings.toggleLabel')}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-300 dark:text-disc-muted/50 cursor-not-allowed"
          >
            <Settings size={16} />
          </button>
        </div>

        {filtersOpen && (filterGroups.length > 0 || helperOptions.length > 0) && (
          <div ref={filterRowRef} className="flex flex-wrap items-center gap-2 w-full">
            {filterGroups.map(({ group, labels }, idx) => {
              const activeLabels = labelFilter.filter((l) => (l.group ?? null) === group)
              // ชื่อกลุ่มมาจาก DB — ห้ามแปลผ่าน t()
              const groupName = group || t('modal.ungrouped')
              return (
                <div key={group || '_'} className="relative">
                  <button
                    onClick={() => setOpenGroupIdx((v) => (v === idx ? null : idx))}
                    className={`flex items-center gap-1.5 h-9 pl-3 pr-2.5 text-sm rounded-lg border font-medium transition max-w-[220px] ${
                      activeLabels.length
                        ? 'border-teal bg-teal/10 text-teal'
                        : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                    }`}
                  >
                    <span className="truncate">
                      {groupName}
                      {activeLabels.length > 0 && `: ${activeLabels.map((l) => l.name).join(', ')}`}
                    </span>
                    <ChevronDown size={14} className="shrink-0" />
                  </button>

                  {openGroupIdx === idx && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5">
                      {labels.map((l) => {
                        const on = selectedIds.has(String(l.id))
                        const tint = chipProps(l)
                        return (
                          <button
                            key={l.id}
                            onClick={() => toggleLabelFilter(l)}
                            style={on ? tint.style : undefined}
                            className={`flex items-center gap-1 px-3 py-1 text-sm rounded-md font-medium border whitespace-nowrap ${
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
                  )}
                </div>
              )
            })}

            {helperOptions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setOpenGroupIdx((v) => (v === 'helper' ? null : 'helper'))}
                  className={`flex items-center gap-1.5 h-9 pl-3 pr-2.5 text-sm rounded-lg border font-medium transition max-w-[220px] ${
                    helperFilter.length
                      ? 'border-teal bg-teal/10 text-teal'
                      : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                  }`}
                >
                  <span className="truncate">
                    {t('filter.helperGroup')}
                    {helperFilter.length > 0 &&
                      `: ${helperOptions.filter((h) => selectedHelperIds.has(h.id)).map((h) => h.name).join(', ')}`}
                  </span>
                  <ChevronDown size={14} className="shrink-0" />
                </button>

                {openGroupIdx === 'helper' && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5">
                    {helperOptions.map((h) => {
                      const on = selectedHelperIds.has(h.id)
                      return (
                        <button
                          key={h.id}
                          onClick={() => toggleHelperFilter(h.id)}
                          className={`flex items-center gap-1 px-3 py-1 text-sm rounded-md font-medium border whitespace-nowrap ${
                            on
                              ? 'bg-teal/10 border-transparent ring-1 ring-teal text-teal'
                              : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                          }`}
                        >
                          {h.name}
                          <span className="text-warm-400 dark:text-disc-muted">{h.count}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {(labelFilter.length > 0 || helperFilter.length > 0) && (
              <button
                onClick={() => { setLabelFilter([]); setHelperFilter([]) }}
                className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 rounded-lg transition-colors whitespace-nowrap"
              >
                {t('filter.clear')}
              </button>
            )}
          </div>
        )}
      </div>

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
      ) : inArchive && visible.length === 0 ? (
        // กรุว่างต้องบอกตรงๆ ไม่ใช่โชว์ 6 กองเปล่าให้เดาเอง
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {(labelFilter.length || helperFilter.length) ? t('filter.noMatch') : t('empty.archived')}
        </div>
      ) : (
        // 2 โหมด layout เท่านั้น — **ไม่มีการปัดแนวนอนที่ไหนเลย** (user เกลียดการปัด · เคยทำ snap แบบ Trello แล้วไม่เอา)
        //   xl (≥1280): กองหารความกว้างจอเป็นคอลัมน์
        //   เล็กกว่านั้น: กองเดียวกันซ้อนลงมา กดพับ/กางได้ (แนวเดียวกับ Notion/Linear/Asana บนมือถือ)
        <div className={`flex flex-col gap-3 xl:grid xl:gap-2 ${groupBy === 'due' ? 'xl:grid-cols-5' : 'xl:grid-cols-6'}`}>
          {groups.map(({ key, cards: list }) => {
            const sorted = sortCardsBy(list, sort)
            const shown = sorted.slice(0, MAX_PER_COLUMN)
            const isOpen = openState[key] ?? sorted.length > 0
            const head = groupBy === 'due' ? t(`due.${key}`) : t(`status.${key}`)
            return (
              <div
                key={key}
                onDragOver={(e) => { if (!canDrag) return; e.preventDefault(); setOverColumn(key) }}
                onDragLeave={(e) => {
                  // ออกจากกองจริงๆ เท่านั้น — ไม่งั้นย้ายเมาส์ข้ามการ์ดในกองเดียวกันไฮไลต์กระพริบ
                  if (e.currentTarget.contains(e.relatedTarget)) return
                  setOverColumn((s) => (s === key ? null : s))
                }}
                onDrop={(e) => {
                  if (!canDrag) return
                  e.preventDefault()
                  setOverColumn(null)
                  setDraggingId(null)
                  moveTo(e.dataTransfer.getData('text/plain'), key)
                }}
                /* ไฮไลต์ทั้งกองตอนลาก — user เคาะ 2026-08-19 ว่าเอาแบบนี้ก่อน ไม่ต้องมีเส้นบอกตำแหน่งในกอง
                   (ลำดับในกองคำนวณจาก กำหนดส่ง→ความสำคัญ→ใหม่ก่อน · ยังไม่มี sort_order ให้ลากจัดเอง)
                   ⚠️ ใช้ ring ไม่ใช่ border — border ทำให้กองขยับ 2px ตอนไฮไลต์ */
                className={`w-full xl:min-w-0 rounded-lg flex flex-col transition-colors ${
                  overColumn === key ? 'bg-teal/15 dark:bg-teal/20 ring-2 ring-teal ring-inset' : ''
                }`}
              >
                {/* ⚠️ หัวกองเป็น div ไม่ใช่ button แล้ว — มีปุ่ม + ซ้อนอยู่ (button ซ้อน button = HTML ผิด) */}
                <div
                  style={columnHeadProps(key).style}
                  className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${columnHeadProps(key).className}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenState((s) => ({ ...s, [key]: !isOpen }))}
                    className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left xl:cursor-default"
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
                  {/*
                    เพิ่มการ์ดลงกองนี้เลย — โผล่เฉพาะโหมด "ตามสถานะ"
                    ⛔ โหมดกำหนดส่งไม่มี เพราะ key เป็นช่วงวัน ไม่ใช่สถานะ (จะสร้างการ์ดสถานะอะไร?)
                    ⛔ ในกรุไม่มี — สร้างการ์ดใหม่เข้ากรุเลยไม่มีความหมาย
                  */}
                  {groupBy === 'status' && !inArchive && (
                    <button
                      type="button"
                      onClick={() => { setAddingIn(key); setOpenState((s) => ({ ...s, [key]: true })) }}
                      aria-label={t('board.addCardHere')}
                      title={t('board.addCardHere')}
                      className="p-1 rounded shrink-0 opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>

                {/* ไม่มี padding ในกอง — การ์ดชิดขอบพอดีแนวเดียวกับแถบหัวสี (user 2026-08-17)
                    เหลือแค่ช่องไฟระหว่างการ์ด ไม่งั้นการ์ดติดกันเป็นก้อนเดียว */}
                <div className={`${isOpen ? 'flex' : 'hidden'} xl:flex flex-col gap-2 min-h-[4rem] pt-2`}>
                  {addingIn === key && (
                    <NewCardInline
                      t={t}
                      busy={creatingIn === key}
                      onCancel={() => setAddingIn(null)}
                      onCreate={(title) => createCardIn(key, title)}
                    />
                  )}
                  {shown.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      t={t}
                      draggable={canDrag}
                      onOpen={(c) => setOpenCardId(c.id)}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      dragging={draggingId === card.id}
                      onClaim={handleClaim}
                      claiming={claimingId === card.id}
                      onRestore={handleRestore}
                      restoring={restoringId === card.id}
                      onPurge={handlePurge}
                      purging={purgingId === card.id}
                      canPurge={canPurge}
                      onDuplicate={duplicateCard}
                      onDelete={(c) => setConfirmCard(c)}
                      onRename={renameCard}
                    />
                  ))}
                  {sorted.length > shown.length && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1">
                      {t('board.moreCards', { count: sorted.length - shown.length })}
                    </p>
                  )}
                  {sorted.length === 0 && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-3 text-center">
                      {(labelFilter.length || helperFilter.length) ? t('filter.noMatch') : t('board.emptyColumn')}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-sm text-warm-400 dark:text-disc-muted">
        {inArchive ? t('controls.archiveNote') : groupBy === 'due' ? t('controls.dueModeNote') : t('board.dragHint')}
      </p>

      {/* กล่อง "ลบ" จากเมนูบนการ์ด — ตัวเดียวกับที่ CardModal ใช้ (เข้ากรุ / ลบถาวร / ยกเลิก) */}
      {confirmCard && (
        <DeleteChoiceDialog
          t={t}
          heading={t('actions.deleteCardHeading')}
          title={confirmCard.title}
          impact={t('actions.cardImpactPlain')}
          hideHint={t('actions.cardArchiveHint')}
          hideLabel={t('actions.archive')}
          canPurge={canPurge}
          busy={purgingId === confirmCard.id || archivingId === confirmCard.id}
          onClose={() => setConfirmCard(null)}
          onHide={() => archiveCard(confirmCard)}
          onPurge={() => handlePurge(confirmCard)}
        />
      )}

      {openCardId && (
        <CardModal
          cardId={openCardId}
          onClose={() => setOpenCardId(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}
