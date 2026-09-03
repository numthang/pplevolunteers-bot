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
  Plus, Clock, User, ListChecks, MoreHorizontal, Pencil, Copy,
  ChevronDown, ChevronRight, Loader2, ArchiveRestore, Trash2,
  Filter, ArrowUpDown, Settings, Search, Type, Hash, Calendar, ToggleLeft, List, CircleDot, Link2,
  AlertTriangle, X, Check,
} from 'lucide-react'
import { STATUS_TYPES, isDraggableCard, formatRef, looksLikeRef } from '@/lib/kanbanAccess.js'
import { columnHeadProps, chipProps } from '@/lib/kanbanLabelColors.js'
import { groupCards, isMyCard, defaultDueForBucket } from '@/lib/kanbanGrouping.js'
import { collectFilterGroups, filterCards, cardTags } from '@/lib/kanbanTagFilter.js'
import { filterCardsByText } from '@/lib/kanbanTextFilter.js'
import { sortCardsBy, collectSortableFields, BUILTIN_SORT_FIELDS } from '@/lib/kanbanSort.js'
import { parseViewFromParams, mergeViewIntoSearch, unknownSelections } from '@/lib/kanbanUrlState.js'
import CardModal from './CardModal.jsx'
import DeleteChoiceDialog from './DeleteChoiceDialog.jsx'
import LabelChips from './LabelChips.jsx'
import { ChecklistBar } from './ChecklistFieldBox.jsx'

/**
 * ⭐ ชนิดงาน — **ไม่ใช่ field ที่คนติดเอง** ระบบรู้เองจาก kanban_card_links.entity_type (2026-08-24)
 *
 * user เสนอให้ทำเป็น field "สายงาน" แบบ single select (POSTS/CASES/DOCS) — ไม่เอาด้วย 2 เหตุผล:
 *   1. สายงานจริงคร่อมได้หลายค่า (51 จาก 67 ใบ = 76%) บังคับเลือกอันเดียวคือทิ้งข้อมูลจริง
 *   2. "งานชนิดอะไร" กับ "งานของทีมไหน" คนละแกน — ปนช่องเดียวกันแล้วกรอก
 *      "งานสื่อของทีมลงพื้นที่" ไม่ได้
 * → ชนิดงานอ่านจากลิงก์ตรงๆ ไม่มีใครต้องติดป้ายให้ถูก และติดผิดไม่ได้
 */
const CARD_KINDS = ['plain', 'case', 'post']
const cardKind = (c) => c?.link?.entity_type || 'plain'

// แสดงต่อกองสูงสุดเท่านี้ — กอง "เสร็จ" โตไม่มีเพดาน ไม่ควรวาดหมดทุกใบ
const MAX_PER_COLUMN = 40

/**
 * ⛔ UI ของ "กระดานหลายใบ" — ปิดไว้ (user เคาะ 2026-08-24 หลังทำเสร็จแล้วเปลี่ยนใจ)
 *
 * schema + API + ฝั่งบอทยังอยู่ครบ และการ์ดทุกใบยังมี board_id ชี้ "กระดานหลัก" เหมือนเดิม
 * ที่ปิดคือ **ทางเลือกบนจอ** เท่านั้น
 *
 * เหตุผล (ข้อมูลจริงจากฐาน 2026-08-24 — อย่ารื้อกลับโดยไม่อ่าน):
 *   การ์ด **51 จาก 67 ใบ (76%) คร่อมมากกว่า 1 สายงาน** สูงสุด 7 สายงาน
 *   เช่น K-1 "Primary Vote" = สมาชิกสัมพันธ์ + กองทุนพัฒนาการเมือง + กรรมการจังหวัด
 *   แต่การ์ด 1 ใบอยู่ได้กระดานเดียว (multi-home ถูกตัดจาก MVP) → แยกกระดานตามสายงาน
 *   = 76% ของงานจริงถูกยัดเข้ากระดานเดียวทั้งที่เป็นงานของหลายทีมพร้อมกัน
 *   ของที่ต้องการจริงคือ **ตัวกรอง** ซึ่งมีอยู่แล้วครบ (lib/kanbanTagFilter.js — OR ในกลุ่ม AND ข้ามกลุ่ม)
 *
 * เปิดกลับเมื่อไหร่: วันที่มีทีมที่ 2 ลงงานจริงและต้องการคลังตัวเลือกแยกจากกัน → ตั้งเป็น true
 */
const BOARDS_UI = false

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

// ใส่ปีเสมอ (รูปแบบเดียวกับ components/calling/) — งานข้ามปีดูวันที่ไม่ออกว่าปีไหนถ้าไม่มีปีกำกับ
const fmtDueShort = (d) => new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

/** ปุ่มสลับแบบ segmented — ใช้ทั้งแถว "แสดง" และ "จัดกลุ่ม" ให้หน้าตาเป็นชุดเดียวกัน */
/**
 * Segmented — จอกว้าง = แถบปุ่มติดกัน · **จอมือถือ = `<select>`** (user เคาะ 2026-08-31)
 *
 * ⛔ ห้ามกลับไปเป็นแถบปุ่มล้วนทุกจอ: 5 ตัวเลือกไทย + ป้าย ≈ 460px แต่จอ 375 เหลือที่จริง 336px
 *    → Chrome ถ่าง layout viewport เป็น 409 แล้วย่อทั้งหน้าลง = อาการ "แหกเกินหน้าจอ" ที่ user ทัก
 *      (ปุ่ม "กรุ" โดนดันจนกดไม่ถึง) · ตรวจซ้ำได้: `node scripts/dev/mobileAudit.mjs --routes /kanban`
 * ⭐ render ทั้ง 2 ทรงแล้วซ่อนด้วย class — **ห้ามวัดความกว้างด้วย JS** เพราะ SSR ไม่รู้ขนาดจอ = hydration พัง
 * `counts` ใส่เฉพาะที่นับแล้วมีความหมาย (ดู scopeCounts) — ตัวเลือกที่ไม่มีเลขก็แค่ไม่มีวงเล็บ ไม่ใช่ (0)
 */
function Segmented({ options, value, onChange, label, counts, t }) {
  const withCount = (o) =>
    counts?.[o.value] == null ? o.label : t('controls.optionWithCount', { label: o.label, count: counts[o.value] })

  return (
    <>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="sm:hidden flex-1 min-w-0 h-9 px-2.5 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{withCount(o)}</option>
        ))}
      </select>

      {/* ⭐ จอใหญ่ก็ต้องเห็นตัวเลข (2026-09-03) — ตั้งแต่ isMyCard เลิกนับงานไร้เจ้าภาพเป็น "ของฉัน"
          มุมมอง "ยังไม่มีคนรับ" คือที่เดียวที่งานรอคนรับโผล่ ถ้าไม่มีเลขกำกับ = งานค้างเงียบเหมือนเดิม */}
      <div className="hidden sm:inline-flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
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
            {withCount(o)}
          </button>
        ))}
      </div>
    </>
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
  // แท่งความคืบหน้า lifecycle ของเคส/โพสต์ที่ผูกไว้ (user สั่ง 2026-09-03) — คนละอันกับเช็คลิสต์ข้างบน
  // ใช้ card.status_type ที่คำนวณสดจากต้นทางอยู่แล้ว (LIVE_STATUS_SQL) ไม่ต้องต่อ SQL เพิ่ม
  // เคสมีแค่ 3 ขั้นจริง (open/in_progress/ปิด) ส่วนโพสต์ backlog กับ doing ก่อนส่งตรวจนับเป็นขั้นเดียวกัน
  // (draft คืน NULL จากต้นทางเสมอ ตำแหน่งกองตอน draft เป็นการลากมือ ไม่ใช่สถานะจริงที่แยกได้)
  const linkStage = (() => {
    if (!card.link) return null
    if (card.link.entity_type === 'case') {
      // ⭐ ขั้น "รับเรื่องแล้ว" ต้องมีคนรับผิดชอบจริง ไม่ใช่แค่ status='open' (user ทัก 2026-09-03):
      //    assign ไม่ได้เปลี่ยน cases.status (ดู lib/caseAssign.js) เคส open ที่ยังไม่มีใครรับ
      //    จึงเข้าเงื่อนไข status_type='backlog' เหมือนกัน ถ้านับเป็นขั้น 1 ทันทีจะโกหกว่ามีคนรับแล้ว
      //    ผู้รับผิดชอบของการ์ด sync มาจาก case_assignees อยู่แล้ว (db/kanban/links.js) ใช้เช็คแทนได้เลย
      if (!(card.assignee_ids || []).length) return 0
      const idx = ['backlog', 'doing', 'done'].indexOf(card.status_type)
      return idx === -1 ? null : idx + 1
    }
    if (card.link.entity_type === 'post') {
      // ⭐ เฟส D (2026-09-03) — ขั้นแรกของโพสต์แปลว่า "มีคนลงมือเขียนแล้ว" เหมือนขั้น "รับเรื่องแล้ว"
      //    ของเคส → ไม่มีผู้รับผิดชอบก็ยังไม่ถึงขั้นนั้น (post_assignees เริ่มจากศูนย์ทุกใบ)
      //    ⚠️ ต่างจากเคสตรงที่กั้น**เฉพาะขั้นแรก** ไม่ใช่ทั้งแท่ง: ขั้น review/ready/done อ่านมาจาก
      //       สถานะจริงของ post_episodes ไม่ได้อ่านจาก "ใครรับ" → โพสต์ที่เผยแพร่ไปแล้วแต่ยังไม่มี
      //       ใครกดรับ (ของเก่าทั้งกองหลัง migration เฟส C) ต้องไม่ถูกลบความคืบหน้าที่เกิดขึ้นจริงทิ้ง
      if (['backlog', 'doing'].includes(card.status_type)) {
        return (card.assignee_ids || []).length ? 1 : 0
      }
      const idx = ['review', 'ready', 'done'].indexOf(card.status_type)
      return idx === -1 ? null : idx + 2
    }
    return null
  })()
  const linkStageTotal = card.link?.entity_type === 'case' ? 3 : 4

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(card) } }}
      className={`group bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-2.5 flex flex-col gap-1 cursor-pointer hover:border-teal hover:bg-warm-50 dark:hover:bg-disc-hover focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      {/* ไม่มีรหัส K-42 บนหน้าการ์ด — ดูที่หัว CardModal (ยังใช้อ้างถึงการบ้านในดิสฯ อยู่) */}
      <div className="relative flex items-start gap-1">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
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
            /* ⭐ รหัสอ้างอิงพิมพ์ต่อกับ title เป็นข้อความเดียวกันเลย ไม่ใช่ badge/pill แยก (เคาะ 2026-09-03)
                ตัวอย่างที่ user ให้: "00-69-7308 ท่าผา ขอให้ช่วยประสานซ่อมถนน"
                เคสใช้ ref จริง (เช่น RB-26-A1F3) · โพสต์ยังไม่มี ref — ใช้ entity_id ทำเลข 4 หลักแทน (เช่น 0042)
                รหัสยังคลิกได้ (target="_blank" ตามแบบ CardModal.jsx บรรทัด 445-452) ส่วนชื่อประเภทเต็มๆ
                อยู่ใน title ตอน hover กันงงว่ารหัสนี้เป็นของเคสหรือโพสต์ */
            <h3 className="flex-1 min-w-0 text-base font-semibold text-warm-900 dark:text-disc-text line-clamp-2">
              {card.link && (
                <a
                  href={card.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={`${t(`linked.kind.${card.link.entity_type}`)} · ${t('linked.open')}`}
                  className="text-teal hover:underline"
                >
                  {card.link.entity_type === 'case' ? card.link.ref : String(card.link.entity_id).padStart(4, '0')}
                </a>
              )}
              {card.link ? ' ' : ''}{card.title}
            </h3>
          )}
        </div>

        {!card.archived_at && !renaming && !card.link && (
          <div className="absolute top-0 right-0 flex items-center gap-0.5 bg-warm-50 dark:bg-disc-hover pl-1.5 rounded opacity-0 group-hover:opacity-100 focus-within:opacity-100">
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
          ชื่อกลุ่มไม่ต้องขึ้น การ์ดในคอลัมน์แคบเกิน (ชื่อ field เต็มอยู่ใน tooltip ของชิป)
          ⭐ จำกัดรวมทุก field เหลือ 2 ชิปแรก + "+N" (ย่อการ์ด 2026-09-02) — เดิม max=3 ต่อ field
          หลาย field พร้อมกันเคยดันการ์ดสูงจนล้น ดู maxTotal ใน LabelChips.jsx */}
      <LabelChips labels={cardTags(card)} showGroupName={false} maxTotal={2} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warm-500 dark:text-disc-muted">
        {card.due_at && (
          <span className={`flex items-center gap-1 ${
            state === 'overdue' ? 'text-red-500 font-medium' : state === 'today' ? 'text-orange font-medium' : ''
          }`}>
            <Clock size={16} /> {fmtDueShort(card.due_at)}
          </span>
        )}
        {(card.assignees || []).length > 0 && (
          /* ⭐ ผู้รับผิดชอบหลายคนได้แล้ว (2026-09-03) — โชว์คนแรก + "+N" ไม่ใช่ทุกชื่อ
             การ์ดในคอลัมน์แคบ 3-4 ชื่อเต็มๆ ดันการ์ดสูงจนอ่านอย่างอื่นไม่ทัน · ชื่อครบอยู่ใน title
             ⛔ ห้าม truncate ชื่อคน (user สั่ง 2026-08-19) — ชื่อยาวขึ้นหลังเปลี่ยนมาใช้ display_name
                เช่น "Tee (ราชบุรี)" · ตัดหัวท้ายแล้วดูไม่ออกว่าใคร ปล่อยให้ตกบรรทัดในการ์ดแทน */
          <span className="flex items-center gap-1 min-w-0" title={card.assignees.map((a) => a.name).join(', ')}>
            <User size={16} className="shrink-0" /> <span>{card.assignees[0].name}</span>
            {card.assignees.length > 1 && (
              <span className="text-warm-400 dark:text-disc-muted">+{card.assignees.length - 1}</span>
            )}
          </span>
        )}
      </div>

      {/* แท่ง lifecycle ของเคส/โพสต์ที่ผูกไว้ — คนละแท่งกับเช็คลิสต์ข้างล่าง (การ์ดผูกก็มีเช็คลิสต์ของตัวเองได้)
          ซ่อนตอน draft/สถานะที่ยังหาขั้นไม่ได้ (linkStage=null) แทนโชว์แท่งว่างที่อ่านไม่ออกว่าคืออะไร */}
      {linkStage != null && (
        <div className="flex items-center gap-1.5 text-warm-500 dark:text-disc-muted" title={t('linked.statusHint', { kind: t(`linked.kind.${card.link.entity_type}`) })}>
          <CircleDot size={16} className="shrink-0" />
          <ChecklistBar done={linkStage} total={linkStageTotal} className="flex-1" tone="blue" />
        </div>
      )}

      {/* ความคืบหน้าเช็คลิสต์เป็น **แท่ง** ไม่ใช่ตัวเลข x/y (user สั่ง 2026-08-19)
          อยู่บรรทัดของตัวเอง — ยัดในแถว meta แล้วแท่งแคบจนอ่านไม่ออกบนคอลัมน์แคบ
          ตัวเลขจริงย้ายไป title ให้เอาเมาส์ชี้ดูได้ ไม่ได้หายไปเฉยๆ */}
      {total > 0 && (
        <div className="flex items-center gap-1.5 text-warm-500 dark:text-disc-muted" title={`${done}/${total}`}>
          <ListChecks size={16} className="shrink-0" />
          <ChecklistBar done={done} total={total} className="flex-1" />
        </div>
      )}

      {/* อยู่ในกรุ = เอาออก · และ (admin เท่านั้น) ลบถาวร — ที่เดียวในระบบที่ลบการ์ดจริงได้
          ⭐ ปุ่มการ์ด kanban (รับงาน/เอากลับ/ลบถาวร) เป็น **ข้อยกเว้นเดียว** ของ §Type scale
          (เคาะ 2026-09-02): px-3 py-1.5 text-sm แทนมาตรฐาน px-4 py-2 text-base ทั้งโปรเจกต์ —
          พื้นที่การ์ดแคบ การ์ดเดียวมีปุ่มได้หลายอัน ปุ่มมาตรฐานดันการ์ดสูงเกินไป
          ⛔ ห้ามลอกขนาดนี้ไปใช้นอกการ์ด kanban — ที่อื่นยังเป็น px-4 py-2 text-base ตามเดิม */}
      {card.archived_at ? (
        <div className="self-start flex flex-wrap items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRestore(card) }}
            disabled={restoring}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium disabled:opacity-50 transition"
          >
            <ArchiveRestore size={14} />
            {restoring ? t('actions.restoring') : t('actions.restore')}
          </button>
          {/* คนที่ไม่ใช่ admin ไม่เห็นปุ่มนี้เลย — ไม่ใช่กดแล้วเด้ง 403 */}
          {canPurge && (
            <button
              onClick={(e) => { e.stopPropagation(); onPurge(card) }}
              disabled={purging}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-red-300 dark:border-red-500/40 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 font-medium disabled:opacity-50 transition"
            >
              <Trash2 size={14} />
              {purging ? t('actions.purging') : t('actions.purge')}
            </button>
          )}
        </div>
      ) : !(card.assignee_ids || []).length && (
        /* งานที่ยังไม่มีคนรับ = รับได้จากหน้าการ์ดเลย ไม่ต้องเปิดกล่องก่อน
           (กองรอทำโผล่ในตัวกรอง "ของฉัน" อยู่แล้ว — ต้องรับได้ในคลิกเดียว ไม่งั้นก็ค้างเหมือนเดิม) */
        <button
          onClick={(e) => { e.stopPropagation(); onClaim(card) }}
          disabled={claiming}
          className="self-start px-3 py-1.5 text-sm rounded-lg bg-teal hover:opacity-90 text-white font-medium disabled:opacity-50 transition"
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
  // ⭐ ชนเพดาน CARD_HARD_CAP = รายการไม่ครบ → **ต้องบอกตรงๆ** ห้ามเงียบ
  //    ตัวกรองและตัวเรียงของหน้านี้ทำงานบนชุดที่โหลดมาทั้งคู่ (kanbanTagFilter/kanbanSort)
  //    เงียบไว้เมื่อไหร่ = "ไม่พบ" แปลว่า "ไม่พบในที่โหลดมา" และ "เรียงแล้ว" ก็เรียงไม่ครบ
  const [truncated, setTruncated] = useState(false)
  const [actionError, setActionError] = useState('')
  const [openCardId, setOpenCardId] = useState(null)
  // เราเป็นคนดัน ?card= เข้า history เองหรือเปล่า — ตัดสินว่าตอนปิดจะ back() ได้ไหม
  // (เปิดหน้ามาด้วยลิงก์ตรงเลย = ไม่มีหน้าก่อนหน้าให้ถอยกลับ back() จะพาออกนอกเว็บ)
  const pushedCardUrl = useRef(false)
  const [draggingId, setDraggingId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  // พับ/กางรายกอง — มีผลเฉพาะจอต่ำกว่า xl (จอใหญ่เป็นคอลัมน์ กางเสมอ)
  // ค่าที่ไม่ได้กดเอง = auto: กองที่มีการ์ดกางไว้ กองว่างพับเก็บ
  const [openState, setOpenState] = useState({})
  // กด "โหลดเพิ่ม" แล้วโชว์อีก MAX_PER_COLUMN ใบต่อกอง — ไม่ยิง API ใหม่ การ์ดทั้งหมดอยู่ใน cards แล้ว
  const [extraShown, setExtraShown] = useState({})
  const [claimingId, setClaimingId] = useState(null)
  const [restoringId, setRestoringId] = useState(null)
  const [purgingId, setPurgingId] = useState(null)
  const [confirmCard, setConfirmCard] = useState(null)   // การ์ดที่กำลังถามว่าจะเข้ากรุหรือลบถาวร
  const [archivingId, setArchivingId] = useState(null)
  const [addingIn, setAddingIn] = useState(null)     // กองที่กำลังพิมพ์ชื่อการ์ดใหม่อยู่
  const [creatingIn, setCreatingIn] = useState(null)
  const [canPurge, setCanPurge] = useState(false)   // มาจาก API โหมดกรุ — client ห้ามเดาสิทธิ์ตัวเอง

  // 2 ปุ่มควบคุมที่แทนที่การมี 2 หน้า
  const [scope, setScope] = useState('mine')     // 'mine' | 'unassigned' | 'all' | 'archived' — ตั้งต้นของฉัน
  const [groupBy, setGroupBy] = useState('status') // 'status' | 'due'
  const [labelFilter, setLabelFilter] = useState([])
  // คำค้นข้อความ — อยู่นอกกรวยกรอง (ช่องค้นหาต้องพิมพ์ได้เลย ไม่ต้องกดเปิดอะไรก่อน)
  const [textQuery, setTextQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState([])   // user_id (string) ของผู้รับผิดชอบที่ถูกเลือกกรอง
  const [kindFilter, setKindFilter] = useState([])       // ชนิดงาน: 'plain' | 'case' | 'post' (ว่าง = ทั้งหมด)
  const [statusFilter, setStatusFilter] = useState([])   // status_type ที่ถูกเลือกกรอง (แยกจาก groupBy — กรองซ่อนใบที่ไม่เข้าเกณฑ์ ไม่ใช่จัดกอง)
  // dropdown ไหนกำลังกางอยู่ — index ใน filterGroups (ป้าย) หรือ 'assignee' (pill ผู้รับผิดชอบท้ายแถว) หรือ 'status' หรือ null = ปิดหมด
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

  // เมนูเฟือง (ตั้งค่า) — เมนูย่อยแบบ Notion ต่อชั้นได้ (settingsSubmenu = หัวข้อย่อยที่กางแผงตัวเลือกอยู่)
  // ตอนนี้มีแค่ "จัดกลุ่ม" ย้ายมาจากแถวถาวรเข้ามาไว้ในนี้ (user ขอ 2026-08-31)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSubmenu, setSettingsSubmenu] = useState(null)
  const settingsBoxRef = useRef(null)

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

  // เมนูเฟือง — กติกาปิดเดียวกับเมนูเรียงลำดับ · ปิดเมนูย่อยด้วยเสมอไม่งั้นเปิดเฟืองรอบหน้าจะกางค้าง
  useEffect(() => {
    if (!settingsOpen) return
    function onClickOutside(e) {
      if (settingsBoxRef.current && !settingsBoxRef.current.contains(e.target)) {
        setSettingsOpen(false)
        setSettingsSubmenu(null)
      }
    }
    function onKey(e) { if (e.key === 'Escape') { setSettingsOpen(false); setSettingsSubmenu(null) } }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [settingsOpen])

  // ฟอร์ม "เพิ่มการบ้าน" — inline panel · ไม่ POST จนกว่าจะกดบันทึก (กฎ CLAUDE.md §Create vs Update)
  // กระดาน (ก้อน 3 · 2026-08-24) — activeBoardId = null คือ "ทุกกระดาน" (ค่าตั้งต้น)
  // ⭐ เป็น **ปุ่มควบคุมอีกแถว ไม่ใช่ URL แยก** — ยึดกติกาเดียวกับที่ยุบ 2 หน้าเมื่อ 2026-08-18
  //    (user: "อยากให้คนคุ้นเคยรูปแบบเดียวจบ")
  // ⚠️ 2026-08-30: เดิมเขียนต่อว่า "แลกกับการแชร์ลิงก์เจาะกระดานไม่ได้ ซึ่งยังไม่มีใครขอ" — **ขอแล้ว**
  //    ตอนนี้กระดานอยู่ใน URL (`?board=`) เหมือนตัวกรองตัวอื่น แต่ยังเป็นปุ่มแถวเดิม ไม่ใช่ route แยก
  const [boards, setBoards] = useState([])
  const [activeBoardId, setActiveBoardId] = useState(null)
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')   // '' = ยังไม่ได้กดสร้าง · ต้องกดบันทึกถึงจะ POST
  const [addingBoard, setAddingBoard] = useState(false)
  const [creatingBoard, setCreatingBoard] = useState(false)
  const boardBoxRef = useRef(null)
  /**
   * hydrate จาก URL เสร็จหรือยัง — **ต้องเป็น state ไม่ใช่ ref**
   *
   * ⛔ เคยเป็น useRef แล้วพัง (2026-08-30): เปิด /kanban?group=due แล้วพารามิเตอร์หายทันที
   *    เพราะ effect ทั้งสองตัวทำงานใน commit เดียวกัน — ตัวอ่านตั้ง ref = true แล้ว
   *    แต่ setState ที่มันเรียกยังไม่มีผลจนกว่าจะ render รอบถัดไป
   *    → ตัวเขียนวิ่งต่อทันทีโดยเห็น state เป็น "ค่าตั้งต้น" แล้ว replaceState ล้าง URL ทิ้ง
   *    เป็น state แล้ว ตัวเขียนจะได้ทำงานครั้งแรกใน render ที่ค่าจาก URL ลงครบแล้วเท่านั้น
   */
  const [urlHydrated, setUrlHydrated] = useState(false)

  // กรุใช้ endpoint แยก — ของฉัน/ทั้งหมด กรองจากชุดเดียวกันในเครื่อง ไม่ต้องยิงใหม่
  const inArchive = scope === 'archived'

  /**
   * ลิงก์ตรงเข้าการ์ด — `?card=<id>` (user เคาะ 2026-08-28 · แทน "open as full page" ของ AppFlowy)
   *
   * ⭐ **URL เป็นเจ้าของสถานะ "การ์ดไหนเปิดอยู่"** ไม่ใช่ state — เปิด/ปิดจึงไปยุ่งกับ history
   *    แล้วให้ popstate เป็นคนเซ็ต state กลับมาที่เดียว ไม่มีทางที่ URL กับหน้าจอจะไม่ตรงกัน
   *
   * ⚠️ ใช้ history API ดิบ ไม่ใช่ router.push ของ Next — ?card= เป็นเรื่องของ client ล้วนๆ
   *    router.push จะวิ่งไป server แล้ว re-render ทั้งหน้า = กระดานกะพริบ + ยิง query ใหม่ฟรีๆ
   */
  useEffect(() => {
    const syncFromUrl = () => {
      const search = window.location.search
      const id = new URLSearchParams(search).get('card')
      // รับได้ทั้ง 'KB-42' (ที่แชร์กัน) และ '154' (id ภายใน ของลิงก์เก่า) — ฝั่ง API แยกให้เองที่ cardContext
      setOpenCardId(id && (looksLikeRef(id) || /^\d+$/.test(id)) ? id : null)

      // ตัวกรองทั้งชุดก็อ่านจาก URL ที่เดียวกัน (2026-08-30) — คนละชั้นกับการ์ด แต่กติกาเดียวกัน
      const v = parseViewFromParams(search)
      setActiveBoardId(v.board)
      setScope(v.scope)
      setGroupBy(v.group)
      setStatusFilter(v.status)
      setKindFilter(v.kind)
      setAssigneeFilter(v.assignee)
      setLabelFilter(v.label)
      setTextQuery(v.q)
      setSort(v.sort)
      setUrlHydrated(true)
    }
    syncFromUrl()                                   // เปิดหน้าด้วยลิงก์ตรง → กางการ์ด + ตั้งตัวกรองให้เลย
    window.addEventListener('popstate', syncFromUrl) // กด Back = ปิดการ์ด / ย้อนตัวกรอง
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  /**
   * เขียนตัวกรองกลับลง URL — **replaceState ไม่ใช่ pushState**
   *
   * ⛔ ห้ามเปลี่ยนเป็น push: `closeCard()` พึ่ง `history.back()` เพื่อปิดการ์ด
   *    ถ้าตัวกรอง push ด้วย กดปิดการ์ดจะเด้งกลับไปตัวกรองชุดก่อนแทนที่จะปิด — สัญญาของ ?card= พังทันที
   *    (และพิมพ์ค้นหา 1 ตัวอักษร = 1 history entry คนกด Back ออกจากหน้าไม่ได้)
   *
   * ⛔ ห้ามใช้ router.replace ของ Next แม้ /posts กับ /finance/transactions จะใช้แบบนั้น —
   *    /kanban/page.js เป็น server component → วิ่งกลับ server ทุกครั้ง = พิมพ์ค้นหาทีละตัวยิง getSession()
   *    (เหตุผลเดียวกับที่ ?card= ใช้ history API ดิบ — ดูคอมเมนต์ข้างบน)
   *
   * ⚠️ ต้องรอ hydrate จาก URL ก่อน ไม่งั้น render แรกจะเขียนค่าตั้งต้นทับลิงก์ที่คนเพิ่งเปิดมา
   */
  useEffect(() => {
    if (!urlHydrated) return
    const next = mergeViewIntoSearch(window.location.search, {
      board: activeBoardId, scope, group: groupBy,
      status: statusFilter, kind: kindFilter, assignee: assigneeFilter,
      label: labelFilter, q: textQuery, sort,
    })
    const target = next ? `${window.location.pathname}?${next}` : window.location.pathname
    if (window.location.pathname + window.location.search !== target) {
      window.history.replaceState(null, '', target)
    }
  }, [urlHydrated, activeBoardId, scope, groupBy, statusFilter, kindFilter, assigneeFilter, labelFilter, textQuery, sort])

  function openCard(id) {
    const url = new URL(window.location.href)
    url.searchParams.set('card', String(id))
    window.history.pushState(null, '', url)
    pushedCardUrl.current = true
    setOpenCardId(String(id))
  }

  function closeCard() {
    // เราดันเข้า history เอง → ถอยกลับ ให้ popstate เป็นคนปิด (ปุ่ม Back ของเบราว์เซอร์จึงไม่ค้าง)
    if (pushedCardUrl.current) {
      pushedCardUrl.current = false
      window.history.back()
      return
    }
    // เปิดมาด้วยลิงก์ตรง → ไม่มีที่ให้ถอย แค่ลบพารามิเตอร์ทิ้ง
    const url = new URL(window.location.href)
    url.searchParams.delete('card')
    window.history.replaceState(null, '', url)
    setOpenCardId(null)
  }

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const boardQ = activeBoardId ? `&board=${activeBoardId}` : ''
      const res = await fetch(`/api/kanban/cards?view=${inArchive ? 'archived' : 'board'}${boardQ}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(json.error || t('loadFailed')); setCards([]); setTruncated(false); return }
      setCards(json.cards || [])
      setTruncated(Boolean(json.truncated))
      setViewerUserId(json.viewerUserId ?? null)
      // ทั้งกระดานและกรุส่งมา — กระดานก็มีเมนู ⋯ → ลบ แล้ว (ก้อน B)
      setCanPurge(Boolean(json.canPurge))
    } catch {
      setLoadError(t('loadFailed'))
      setCards([])
      setTruncated(false)
    } finally {
      setLoading(false)
    }
  }, [t, inArchive, activeBoardId])

  // สลับเข้า/ออกกรุ หรือสลับกระดาน = คนละชุดข้อมูล ต้องโหลดใหม่
  // (สลับ ของฉัน↔ทั้งหมด ไม่ต้อง — กรองในเครื่องจากชุดเดิม)
  useEffect(() => { setLoading(true); load() }, [load])

  // รายชื่อกระดาน — โหลดครั้งเดียว แล้วอัปเดตเองตอนสร้างใหม่ (ไม่ต้องยิงซ้ำทุกครั้งที่สลับกอง)
  const loadBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/kanban/boards')
      const json = await res.json().catch(() => ({}))
      if (res.ok) setBoards(json.boards || [])
    } catch { /* โหลดรายชื่อไม่ได้ = ยังใช้หน้าได้ (ตกไปที่ "ทุกกระดาน") ไม่ต้องขึ้น error ทั้งหน้า */ }
  }, [])
  useEffect(() => { loadBoards() }, [loadBoards])

  // beforeunload เตือนถ้ามีชื่อกระดานค้างในช่องที่ยังไม่กดสร้าง
  // (กฎ CLAUDE.md §Create — ห้าม autosave และห้ามปล่อยให้พิมพ์ค้างแล้วปิดแท็บหาย)
  useEffect(() => {
    if (!addingBoard || !newBoardName.trim()) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [addingBoard, newBoardName])

  // คลิกนอกกล่อง / ESC → ปิด dropdown กระดาน (มาตรฐานเดียวกับ dropdown อื่นในหน้านี้)
  useEffect(() => {
    if (!boardMenuOpen) return
    const onDown = (e) => { if (!boardBoxRef.current?.contains(e.target)) closeBoardMenu() }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeBoardMenu() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)   // capture — CardModal ผูก ESC ไว้ก่อน
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [boardMenuOpen])

  // กรอง → จัดกอง · ลำดับนี้สำคัญ: ชิปกรองต้องสร้างจากการ์ดที่ "เห็นได้ตามขอบเขต" ไม่ใช่ทั้ง org
  const scoped = useMemo(
    // ในกรุโชว์ทุกใบ ไม่แยกของใคร — ของที่เก็บเข้ากรุแล้วมีไม่เยอะ และคนตามหามักจำไม่ได้ว่าใครเก็บ
    () => {
      if (scope === 'mine') return cards.filter((c) => isMyCard(c, viewerUserId))
      // ⚠️ "ไม่มีคนรับ" = ไม่มีแถวใน kanban_card_assignees เลย — **อยู่กองไหนก็ได้** ตั้งแต่ถอดกฎ
      //    2026-09-03 (เดิม trigger บังคับให้อยู่ backlog เท่านั้น) → มุมมองนี้คร่อมทุกกองโดยตั้งใจ
      if (scope === 'unassigned') return cards.filter((c) => !(c.assignee_ids || []).length)
      // 'assigned' = ด้านตรงข้ามของ unassigned — มีไว้ให้เลขฝั่งขวาของ "กำลังทำ" บนหน้าแรก
      // กดแล้วเจอชุดเดียวกันเป๊ะ (db/kanban/cards.js countCardStats)
      if (scope === 'assigned') return cards.filter((c) => (c.assignee_ids || []).length > 0)
      return cards
    },
    [cards, scope, viewerUserId]
  )
  /**
   * จำนวนต่อมุมมองที่โชว์ในวงเล็บของ dropdown "แสดง" บนมือถือ (user ขอ 2026-08-31)
   * นับในเครื่องจากการ์ดที่โหลดมาแล้ว ไม่ยิง API เพิ่ม — 4 มุมมองแรกเป็นตัวกรองฝั่ง client อยู่แล้ว (ดู scoped)
   *
   * ⚠️ **"กรุ" เป็นคนละ fetch** (`?view=archived`) → กฎคือ *นับเฉพาะชุดที่โหลดมาจริงตอนนี้*
   *    อยู่นอกกรุ = มีเลข 4 ตัวแรก "กรุ" ไม่มีเลข · อยู่ในกรุ = มีเลขเฉพาะ "กรุ"
   *    (เผลอนับ 4 ตัวแรกจาก `cards` ตอนอยู่ในกรุเมื่อไหร่ ตัวเลขโกหกทันที เพราะ `cards` ตอนนั้นคือการ์ดในกรุ)
   * ⚠️ ระหว่างโหลดคืน {} — ไม่งั้นวงเล็บขึ้น (0) ทุกช่องแวบนึงแล้วค่อยเด้งเป็นเลขจริง
   */
  const scopeCounts = useMemo(() => {
    if (loading) return {}
    if (inArchive) return { archived: cards.length }
    return {
      mine: cards.filter((c) => isMyCard(c, viewerUserId)).length,
      unassigned: cards.filter((c) => !(c.assignee_ids || []).length).length,
      assigned: cards.filter((c) => (c.assignee_ids || []).length > 0).length,
      all: cards.length,
    }
  }, [cards, loading, inArchive, viewerUserId])
  const filterGroups = useMemo(() => collectFilterGroups(scoped), [scoped])
  // ผู้ช่วยที่ "มีอยู่จริง" บนการ์ดที่โหลดมา + จำนวนใบที่ติด — เหตุผลเดียวกับ collectFilterGroups
  // (ไม่เอาทั้ง org มาวาง จะได้ตัวเลือกกดแล้วว่างเปล่าเต็มไปหมด)
  const assigneeOptions = useMemo(() => {
    const map = new Map()
    const add = (userId, name) => {
      if (!userId) return
      const id = String(userId)
      if (!map.has(id)) map.set(id, { id, name: name || '', count: 0 })
      map.get(id).count++
    }
    for (const c of scoped) {
      // เจ้าภาพต้องอยู่ในตัวเลือกด้วย (2026-09-03) — ไม่งั้นเลือกกรองชื่อเขาไม่ได้เลย
      // ทั้งที่เขาคือคนที่รับผิดชอบใบนั้นจริงๆ (คู่กับตัวกรองข้างล่างที่นับเจ้าภาพแล้ว)
      for (const a of c.assignees || []) add(a.user_id, a.name)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }, [scoped])
  // จัดกลุ่มกระดานตามเซิร์ฟที่ผูกไว้ — กระดานที่ไม่ผูกเซิร์ฟขึ้นก่อนเสมอ (ไม่มีหัวข้อคั่น)
  // ⚠️ นี่คือ "การจัดกลุ่มบนจอ" ล้วนๆ — guild ไม่ใช่ขอบเขตสิทธิ์ (ดู lib/kanbanAccess.js §ชั้นกระดาน)
  const boardGroups = useMemo(() => {
    const map = new Map()
    for (const b of boards) {
      const k = b.guild_id || null
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(b)
    }
    // null (ไม่ผูกเซิร์ฟ) มาก่อน ที่เหลือเรียงตามชื่อเซิร์ฟ
    return [...map.entries()]
      .sort((a, b) => (a[0] === null ? -1 : b[0] === null ? 1 : String(a[0]).localeCompare(String(b[0]))))
      .map(([guildId, items]) => ({ guildId, items }))
  }, [boards])
  const guildNames = useMemo(() => {
    const out = {}
    for (const b of boards) if (b.guild_id && b.guild_name) out[b.guild_id] = b.guild_name
    return out
  }, [boards])

  // ตัวกรองชนิดงาน — ตายตัว 3 แบบเสมอ (นับจากลิงก์ ไม่ใช่จาก field ที่คนติด)
  const kindOptions = useMemo(() => {
    const counts = {}
    for (const c of scoped) { const k = cardKind(c); counts[k] = (counts[k] || 0) + 1 }
    return CARD_KINDS.map((key) => ({ id: key, name: t(`filter.kind.${key}`), count: counts[key] || 0 }))
  }, [scoped, t])

  // ตัวกรองสถานะ — ตัวเลือกตายตัว 6 แบบเสมอ (ไม่ต้องคัดจากการ์ดที่โหลดมาแบบป้าย/คนช่วย เพราะไม่มีทาง "ว่าง")
  const statusOptions = useMemo(() => {
    const counts = {}
    for (const c of scoped) counts[c.status_type] = (counts[c.status_type] || 0) + 1
    return STATUS_TYPES.map((key) => ({ id: key, name: t(`status.${key}`), count: counts[key] || 0 }))
  }, [scoped, t])
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
  /**
   * sort ที่มาจาก URL มีแค่ `{key, dir}` — เติม fieldId/type จาก sortOptions ให้ครบ
   * (sortCardsBy ตัดสินด้วย spec.fieldId/spec.type ถ้าไม่เติมจะเรียงผิดชนิดเงียบๆ)
   *
   * ⭐ ตรงนี้ **แยก "ไม่มีอยู่แล้ว" ออกจาก "ยังไม่โหลด" ได้** — ต่างจากป้าย/ผู้ช่วย
   *    เพราะ SQL ส่ง field def ที่ยัง active ของกระดานนั้นมาครบทุกใบ ไม่ใช่แค่ที่กรอกแล้ว
   *    (db/kanban/cards.js §AGG) → โหลดเสร็จแล้วยังหาไม่เจอ = ถูกซ่อน/ลบ/คนละกระดาน จริงๆ
   * ⚠️ ต้องรอ !loading ไม่งั้น render แรกที่ยังไม่มีการ์ดจะล้าง sort ของลิงก์ทิ้ง
   */
  useEffect(() => {
    if (loading || !sort || sort.type) return
    const opt = sortOptions.find((o) => o.key === sort.key)
    setSort(opt ? { ...opt, dir: sort.dir } : null)
  }, [loading, sort, sortOptions])

  const filteredSortOptions = useMemo(() => {
    const q = sortQuery.trim().toLowerCase()
    if (!q) return sortOptions
    return sortOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [sortOptions, sortQuery])
  const visible = useMemo(() => {
    let out = filterCards(scoped, labelFilter)
    if (statusFilter.length) {
      const wanted = new Set(statusFilter)
      out = out.filter((c) => wanted.has(c.status_type))
    }
    if (assigneeFilter.length) {
      const wanted = new Set(assigneeFilter)
      // ⭐ 2026-09-03: นับ **เจ้าภาพด้วย** ไม่ใช่แค่ผู้ช่วย — เดิมกรองชื่อคนหนึ่งแล้วไม่เจอใบที่เขา
      //    เป็นแม่งาน (เจ้าภาพไม่มีแถวในตารางคนช่วยตามดีไซน์เดิม) = ตัวกรองโกหกมาตลอด
      //    ⭐ เฟส B ปิดบั๊กนี้ที่ต้นเหตุ: เหลือลิสต์เดียว ไม่มีคนที่อยู่นอกลิสต์อีกแล้ว
      out = out.filter((c) =>
        (c.assignee_ids || []).some((id) => wanted.has(String(id))))
    }
    if (kindFilter.length) {
      const wanted = new Set(kindFilter)
      out = out.filter((c) => wanted.has(cardKind(c)))
    }
    // ⚠️ ค้นข้อความเป็น **ตัวสุดท้าย** ของสาย — ตัวเลือกในกรวย (ป้าย/คนช่วย/สถานะ/ชนิด) นับจำนวน
    //    จาก `scoped` ไม่ใช่จากตรงนี้ ถ้าเอาไปไว้ต้นสายตัวเลขในกรวยจะไม่ขยับตามคำค้น = อ่านแล้วงง
    return filterCardsByText(out, textQuery)
  }, [scoped, labelFilter, assigneeFilter, statusFilter, kindFilter, textQuery])
  const groups = useMemo(() => groupCards(visible, groupBy), [visible, groupBy])

  /**
   * ตัวกรองที่ยังกรองอยู่ แต่ **หาไม่เจอในการ์ดที่โหลดมา** — เกิดตอนเปิดลิงก์ของคนอื่น
   * ⭐ ไม่ทิ้ง ไม่เงียบ — โชว์เป็นชิปเทาเหนือกระดานให้กดถอดได้ (เหตุผลเต็มที่ lib/kanbanUrlState.js)
   */
  const knownLabelIds = useMemo(
    () => new Set(filterGroups.flatMap((g) => g.labels).map((l) => String(l.id))),
    [filterGroups]
  )
  const unknownLabels = useMemo(
    () => unknownSelections(labelFilter, knownLabelIds),
    [labelFilter, knownLabelIds]
  )
  const unknownAssignees = useMemo(
    () => unknownSelections(assigneeFilter.map((id) => ({ id })), new Set(assigneeOptions.map((h) => h.id))),
    [assigneeFilter, assigneeOptions]
  )
  // ?board= ที่ไม่มีอยู่จริง — ปุ่มกระดานจะตกไปแสดง "ทุกกระดาน" (บรรทัด boards.find(...) || allBoards)
  // ทั้งที่ยังกรองด้วย id นั้นอยู่ = กระดานว่างโดยไม่มีคำอธิบาย · รอ boards โหลดก่อนค่อยตัดสิน
  const unknownBoard = useMemo(
    () => (activeBoardId && boards.length > 0 && !boards.some((b) => String(b.id) === String(activeBoardId))
      ? String(activeBoardId) : null),
    [activeBoardId, boards]
  )

  const selectedIds = new Set(labelFilter.map((l) => String(l.id)))
  const selectedAssigneeIds = new Set(assigneeFilter)
  const selectedStatusIds = new Set(statusFilter)
  const selectedKindIds = new Set(kindFilter)
  // ในกรุลากไม่ได้ — ต้องเอาออกจากกรุก่อนถึงจะขยับสถานะได้ (ไม่งั้นได้การ์ดที่ "เสร็จ" ทั้งที่อยู่ในกรุ)
  const canDrag = groupBy === 'status' && !inArchive

  function toggleLabelFilter(label) {
    setLabelFilter((prev) => {
      const id = String(label.id)
      return prev.some((l) => String(l.id) === id) ? prev.filter((l) => String(l.id) !== id) : [...prev, label]
    })
  }

  function toggleAssigneeFilter(id) {
    setAssigneeFilter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleStatusFilter(key) {
    setStatusFilter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
  }

  function toggleKindFilter(key) {
    setKindFilter((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]))
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
      // ใช้ของจริงที่ server คืนมา (ย้ายกองไม่แตะรายชื่อแล้ว แต่ updated_at/completed_at เปลี่ยน)
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...json.card } : c)))
    } catch {
      setActionError(t('board.moveFailed'))
      setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)))
    }
  }

  /** รับงานที่ยังไม่มีคนรับ — ⛔ การ์ด **ไม่ขยับกอง** (ถอดกฎ 2026-09-03) ได้แค่ชื่อเราขึ้นไปบนใบ */
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
   * ⭐ ใส่ชื่อตัวเองให้ก็ต่อเมื่ออยู่ในมุมมอง **"ของฉัน"** (แก้ 2026-09-03)
   *    ⛔ เดิมดูจาก "กองไหน" (กองที่ไม่ใช่รอทำ = ยัดชื่อให้) — นั่นคือระบบเดาแทนคนตาม**กอง**
   *      ซึ่งถอดทิ้งไปทั้งชุดแล้ว · ที่เหลือคือมารยาทของ **มุมมองที่กรองอยู่**: สร้างของใหม่ในวิว
   *      ที่กรอง "ของฉัน" แล้วมันต้องไม่หายวับไปทันทีที่ Enter (Notion ก็สืบค่าจากตัวกรองแบบนี้)
   */
  async function createCardIn(bucketKey, title) {
    setActionError('')
    setCreatingIn(bucketKey)
    try {
      // โหมดสถานะ: กองคือ status_type ตรงๆ · โหมดกำหนดส่ง: กองคือช่วงเวลา → แปลงเป็น due_at แทน
      // (ปุ่ม + ในโหมดกำหนดส่งเพิ่งมีเมื่อ 2026-08-24 ตอนถอดปุ่ม "เพิ่มการบ้าน" ด้านบนออก
      //  ถ้าไม่มี = สลับมาโหมดนี้แล้วสร้างงานไม่ได้เลย)
      const byStatus = groupBy === 'status'
      const mineView = scope === 'mine'
      const payload = byStatus
        ? { title, statusType: bucketKey, assignToMe: mineView }
        : { title, dueAt: defaultDueForBucket(bucketKey) || undefined, assignToMe: mineView }

      const res = await fetch('/api/kanban/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // กระดานที่กำลังเปิดอยู่ — ดู "ทุกกระดาน" อยู่ = ไม่ส่ง แล้วให้ API ลงกระดานตั้งต้นให้
        body: JSON.stringify({ ...payload, boardId: activeBoardId || undefined }),
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

  function closeBoardMenu() {
    setBoardMenuOpen(false)
    setAddingBoard(false)
    setNewBoardName('')
  }

  /**
   * สร้างกระดาน — user เคาะ 2026-08-24: กรอกชื่ออย่างเดียว แล้วสลับไปกระดานใหม่ทันที
   * ⛔ ห้ามยิง POST ตอนกดปุ่ม "เพิ่มกระดาน" (แค่เปิดช่องพิมพ์) — POST เกิดตอนกดสร้างที่นี่เท่านั้น
   *    (CLAUDE.md 2026-07-30 · เคสจริง /posts เคยได้ร่างเปล่าค้าง DB 5 แถวเพราะทำแบบนั้น)
   */
  async function handleCreateBoard(e) {
    e.preventDefault()
    const name = newBoardName.trim()
    if (!name) return
    setCreatingBoard(true)
    setActionError('')
    try {
      const res = await fetch('/api/kanban/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('saveFailed')); return }
      setBoards((prev) => [...prev, json.board])
      setActiveBoardId(json.board.id)     // เข้าไปในกระดานที่เพิ่งสร้างเลย ไม่ต้องกดซ้ำ
      closeBoardMenu()
    } catch {
      setActionError(t('saveFailed'))
    } finally {
      setCreatingBoard(false)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('page.title')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('page.subtitle')}</p>
        </div>
        {/* ⭐ 2026-08-24 เปลี่ยนจาก "เพิ่มการบ้าน" เป็น "เพิ่มกระดาน" (user เคาะ)
            เหตุผล: เพิ่มการบ้านทำได้จากปุ่ม + บนหัวกองอยู่แล้วทุกกอง — ปุ่มบนเลยซ้ำซ้อน
            ⚠️ ที่ทำคู่กันคือเปิดปุ่ม + ให้โหมด "กำหนดส่ง" ด้วย ไม่งั้นโหมดนั้นจะไม่เหลือทางสร้างเลย
            ในกรุไม่มีปุ่ม — สร้างของใหม่เข้ากรุไม่มีความหมาย (เหตุผลเดิมของปุ่มก่อนหน้า) */}
        {BOARDS_UI && !inArchive && (
          <button
            onClick={() => { setBoardMenuOpen(true); setAddingBoard(true) }}
            className="flex items-center gap-1.5 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2"
          >
            <Plus size={16} />
            {t('board.addBoard')}
          </button>
        )}
      </div>

      {/* แถบควบคุม — ปุ่มพวกนี้แทนที่การมีหลายหน้า (กระดาน / เห็นของใคร / กองตามอะไร) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* กระดาน — dropdown เพราะจำนวนกระดานโตได้เรื่อยๆ (ชิปแนวนอนจะตกบรรทัดบนมือถือ)
            รายการจัดกลุ่มตามเซิร์ฟที่ผูกไว้ ให้รู้สึกเหมือน workspace ตามที่ user มอง
            แต่ guild เป็นแค่ป้าย ไม่ใช่ชั้นข้อมูล (ดู db/kanban/boards.js หัวไฟล์) */}
        {BOARDS_UI && (
        <div ref={boardBoxRef} className="relative flex items-center gap-2">
          <span className="text-sm text-warm-500 dark:text-disc-muted">{t('board.boardLabel')}</span>
          <button
            onClick={() => (boardMenuOpen ? closeBoardMenu() : setBoardMenuOpen(true))}
            className={`flex items-center gap-1.5 h-9 pl-3 pr-2.5 text-sm rounded-lg border font-medium transition max-w-[240px] ${
              activeBoardId
                ? 'border-teal bg-teal/10 text-teal'
                : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
            }`}
          >
            <span className="truncate">
              {activeBoardId
                ? (boards.find((b) => String(b.id) === String(activeBoardId))?.name || t('board.allBoards'))
                : t('board.allBoards')}
            </span>
            <ChevronDown size={14} className="shrink-0" />
          </button>

          {boardMenuOpen && (
            <div className="absolute max-w-[calc(100vw_-_1.5rem)] left-0 top-full z-20 mt-1 w-72 max-h-80 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-1.5">
              <button
                onClick={() => { setActiveBoardId(null); closeBoardMenu() }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md text-left ${
                  !activeBoardId ? 'bg-teal/10 text-teal font-medium' : 'text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                }`}
              >
                <span className="truncate">{t('board.allBoards')}</span>
                <span className="shrink-0 text-warm-400 dark:text-disc-muted">
                  {boards.reduce((sum, b) => sum + (b.card_count || 0), 0)}
                </span>
              </button>

              {boardGroups.map(({ guildId, items }) => (
                <div key={guildId ?? 'none'}>
                  {/* หัวข้อกลุ่มโผล่เฉพาะตอนมีกระดานผูกเซิร์ฟจริง — org ที่ไม่ใช้ Discord ต้องไม่เห็นหัวข้อเปล่า */}
                  {guildId && (
                    <p className="px-3 pt-2 pb-1 text-sm text-warm-400 dark:text-disc-muted truncate">
                      {guildNames[guildId] || t('board.otherServer')}
                    </p>
                  )}
                  {items.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { setActiveBoardId(b.id); closeBoardMenu() }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md text-left ${
                        String(activeBoardId) === String(b.id)
                          ? 'bg-teal/10 text-teal font-medium'
                          : 'text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      <span className="truncate">{b.name}</span>
                      <span className="shrink-0 text-warm-400 dark:text-disc-muted">{b.card_count}</span>
                    </button>
                  ))}
                </div>
              ))}

              <div className="border-t border-warm-200 dark:border-disc-border mt-1.5 pt-1.5">
                {addingBoard ? (
                  <form onSubmit={handleCreateBoard} className="flex items-center gap-1.5 px-1">
                    <input
                      autoFocus
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      placeholder={t('board.newBoardPlaceholder')}
                      maxLength={100}
                      className="flex-1 min-w-0 h-9 px-2.5 text-sm rounded-md border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <button
                      type="submit"
                      disabled={creatingBoard || !newBoardName.trim()}
                      className="flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-md bg-teal text-white hover:opacity-90 disabled:opacity-50 shrink-0"
                    >
                      {creatingBoard && <Loader2 size={14} className="animate-spin" />}
                      {t('board.createBoard')}
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingBoard(true)}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-sm rounded-md text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover"
                  >
                    <Plus size={14} />
                    {t('board.addBoard')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* มือถือ: ไม่มีป้าย "แสดง" · <select> กินเต็มความกว้าง (user สั่ง 2026-09-01)
            ป้ายยังอยู่ครบสำหรับ screen reader ผ่าน `aria-label` ของ <select> — ตัดแค่ตัวหนังสือที่มองเห็น
            เหตุผล: บนมือถือมีตัวควบคุมแค่ 2 แถว บริบทชัดอยู่แล้ว ป้ายกินที่ไปเปล่าๆ ~48px */}
        <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
          <span className="hidden sm:inline shrink-0 text-sm text-warm-500 dark:text-disc-muted">{t('controls.showLabel')}</span>
          <Segmented
            t={t}
            label={t('controls.showLabel')}
            counts={scopeCounts}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'mine', label: t('controls.scopeMine') },
              { value: 'unassigned', label: t('controls.scopeUnassigned') },
              { value: 'assigned', label: t('controls.scopeAssigned') },
              { value: 'all', label: t('controls.scopeAll') },
              { value: 'archived', label: t('controls.scopeArchived') },
            ]}
          />
        </div>

        {/* ค้นหา / กรวยกรอง / เรียงลำดับ / เฟือง (ตั้งค่า — มี "จัดกลุ่ม" อยู่ข้างใน)
            มือถือ = เต็มบรรทัด ช่องค้นหายืดกินที่ที่เหลือ · จอกว้าง = ชิดขวาแถวเดียวกับ "แสดง" เหมือนเดิม */}
        <div className="relative flex flex-wrap items-center gap-1.5 min-w-0 w-full sm:w-auto sm:ml-auto">
          {/* ⭐ ช่องค้นหาอยู่ **นอก** กรวยกรอง — เป็นสิ่งที่คนหยิบใช้บ่อยสุด ต้องพิมพ์ได้เลย
              ไม่ต้องกดเปิดอะไรก่อน (ตัวเลือกในกรวยเป็นของที่เลือกนานๆ ครั้ง คนละจังหวะการใช้)
              ⚠️ กรองในเครื่องจากการ์ดที่โหลดมาแล้ว — ไม่ยิง API ใหม่ พิมพ์แล้วผลขยับทันที
                 (ชนเพดาน CARD_HARD_CAP เมื่อไหร่ แถบเตือน truncated ข้างล่างบอกอยู่แล้ว) */}
          <div className="flex items-center gap-1.5 h-9 px-2 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg flex-1 min-w-0 sm:flex-none sm:w-52">
            <Search size={14} className="text-warm-400 dark:text-disc-muted shrink-0" />
            <input
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              placeholder={t('filter.searchPlaceholder')}
              aria-label={t('filter.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-sm text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none"
            />
            {textQuery && (
              <button
                onClick={() => setTextQuery('')}
                aria-label={t('filter.searchClear')}
                title={t('filter.searchClear')}
                className="shrink-0 p-0.5 rounded text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {/* ตัวกรองสถานะมีตัวเลือกตายตัวเสมอ (6 แบบ) — ปุ่มกรวยเลยโผล่เสมอ ไม่ต้องรอมีป้าย/คนช่วย */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            title={t('filter.toggleLabel')}
            aria-label={t('filter.toggleLabel')}
            className={`flex items-center justify-center h-9 w-9 shrink-0 rounded-lg border transition ${
              filtersOpen || labelFilter.length > 0 || assigneeFilter.length > 0 || statusFilter.length > 0
                ? 'border-teal bg-teal/10 text-teal'
                : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
            }`}
          >
            <Filter size={16} />
          </button>

          {/* ⚠️ มือถือทำตัว static ตั้งใจ — ให้ panel ข้างล่าง (`absolute right-0`) ไปเกาะขอบขวาของ
              **แถวเครื่องมือ** แทนขอบขวาของปุ่ม · ปุ่มเรียงลำดับไม่ได้อยู่ริมขวาสุด (มีเฟืองต่อท้าย)
              เกาะปุ่มแล้วเมนูกว้าง 288px จะยื่นพ้นขอบซ้ายจอ 29px ที่ 320px
              ⛔ อย่าลืมว่า `html { font-size: 18px }` → `w-64` = **288px ไม่ใช่ 256px** (globals.css:22) */}
          <div ref={sortBoxRef} className="static sm:relative">
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
              <div className="absolute max-w-[calc(100vw_-_1.5rem)] right-0 top-full z-20 mt-1 w-64 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2">
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

          {/* เฟือง = เมนูตั้งค่า — เมนูย่อยแบบ Notion (คลิกหัวข้อ → กางแผงตัวเลือกด้านข้าง)
              ตอนนี้มีแค่ "จัดกลุ่ม" แต่โครงรองรับเพิ่มหัวข้อย่อยอื่นต่อท้ายได้เลย (user ขอ 2026-08-31) */}
          <div ref={settingsBoxRef} className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title={t('settings.toggleLabel')}
              aria-label={t('settings.toggleLabel')}
              className={`flex items-center justify-center h-9 w-9 shrink-0 rounded-lg border transition ${
                settingsOpen
                  ? 'border-teal bg-teal/10 text-teal'
                  : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
              }`}
            >
              <Settings size={16} />
            </button>

            {settingsOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-52 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-1">
                <div className="relative">
                  <button
                    onClick={() => setSettingsSubmenu((v) => (v === 'groupBy' ? null : 'groupBy'))}
                    className={`flex items-center justify-between gap-2 w-full px-2 py-1.5 text-sm rounded-md text-left ${
                      settingsSubmenu === 'groupBy'
                        ? 'bg-warm-50 dark:bg-disc-hover text-warm-900 dark:text-disc-text'
                        : 'text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                    }`}
                  >
                    <span>{t('controls.groupLabel')}</span>
                    <ChevronRight
                      size={14}
                      className={`shrink-0 text-warm-400 dark:text-disc-muted transition-transform ${
                        settingsSubmenu === 'groupBy' ? 'rotate-90 sm:rotate-0' : ''
                      }`}
                    />
                  </button>

                  {/* จอเล็ก: กางลงมาในแนวเดิม (ไม่ล้นซ้ายจอ) · sm ขึ้นไป: กางเป็นแผงข้างแบบ Notion
                      ก่อนหน้านี้ล็อก absolute right-full ทุกจอ — บนมือถือแผงกว้าง 192px ดันล้นซ้ายจอ (user เจอ 2026-08-31) */}
                  {settingsSubmenu === 'groupBy' && (
                    <div className="mt-1 w-full sm:mt-0 sm:absolute sm:right-full sm:top-0 sm:mr-1 sm:w-48 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-1">
                      {[
                        { value: 'status', label: t('controls.groupStatus') },
                        { value: 'due', label: t('controls.groupDue') },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setGroupBy(opt.value); setSettingsOpen(false); setSettingsSubmenu(null) }}
                          className={`flex items-center justify-between gap-2 w-full px-2 py-1.5 text-sm rounded-md text-left ${
                            groupBy === opt.value
                              ? 'bg-teal/10 text-teal font-medium'
                              : 'text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                          }`}
                        >
                          {opt.label}
                          {groupBy === opt.value && <Check size={14} className="shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {filtersOpen && (
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
                    <div className="absolute max-w-[calc(100vw_-_1.5rem)] left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5">
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

            {assigneeOptions.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setOpenGroupIdx((v) => (v === 'assignee' ? null : 'assignee'))}
                  className={`flex items-center gap-1.5 h-9 pl-3 pr-2.5 text-sm rounded-lg border font-medium transition max-w-[220px] ${
                    assigneeFilter.length
                      ? 'border-teal bg-teal/10 text-teal'
                      : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                  }`}
                >
                  <span className="truncate">
                    {t('filter.assigneeGroup')}
                    {assigneeFilter.length > 0 &&
                      `: ${assigneeOptions.filter((h) => selectedAssigneeIds.has(h.id)).map((h) => h.name).join(', ')}`}
                  </span>
                  <ChevronDown size={14} className="shrink-0" />
                </button>

                {openGroupIdx === 'assignee' && (
                  <div className="absolute max-w-[calc(100vw_-_1.5rem)] left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5">
                    {assigneeOptions.map((h) => {
                      const on = selectedAssigneeIds.has(h.id)
                      return (
                        <button
                          key={h.id}
                          onClick={() => toggleAssigneeFilter(h.id)}
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

            {/* กรองชนิดงาน — การบ้านที่จดเอง / งานสื่อ / เรื่องร้องเรียน
                ⭐ ไม่ใช่ field ที่คนติดเอง — อ่านจาก kanban_card_links.entity_type ตรงๆ
                   ติดผิดไม่ได้ และการ์ดที่ migrate เข้ามาขึ้นชนิดถูกเองตั้งแต่วินาทีแรก */}
            <div className="relative">
              <button
                onClick={() => setOpenGroupIdx((v) => (v === 'kind' ? null : 'kind'))}
                className={`flex items-center gap-1.5 h-9 pl-3 pr-2.5 text-sm rounded-lg border font-medium transition max-w-[220px] ${
                  kindFilter.length
                    ? 'border-teal bg-teal/10 text-teal'
                    : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                }`}
              >
                <span className="truncate">
                  {t('filter.kindGroup')}
                  {kindFilter.length > 0 &&
                    `: ${kindOptions.filter((k) => selectedKindIds.has(k.id)).map((k) => k.name).join(', ')}`}
                </span>
                <ChevronDown size={14} className="shrink-0" />
              </button>

              {openGroupIdx === 'kind' && (
                <div className="absolute max-w-[calc(100vw_-_1.5rem)] left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5">
                  {kindOptions.map((k) => {
                    const on = selectedKindIds.has(k.id)
                    return (
                      <button
                        key={k.id}
                        onClick={() => toggleKindFilter(k.id)}
                        className={`flex items-center gap-1 px-3 py-1 text-sm rounded-md font-medium border whitespace-nowrap ${
                          on
                            ? 'bg-teal/10 border-transparent ring-1 ring-teal text-teal'
                            : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                        }`}
                      >
                        {k.name}
                        <span className="text-warm-400 dark:text-disc-muted">{k.count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* กรองสถานะ — ตัวเลือกตายตัว 6 แบบ แยกจาก "จัดกลุ่มตามอะไร": กรองซ่อนใบที่ไม่เข้าเกณฑ์ ใช้ได้ทั้ง 2 โหมด groupBy
                (โหมดกำหนดส่งก็กรองสถานะได้ เช่น เอาแต่ "กำลังทำ" มาดูตามกำหนดส่ง) */}
            <div className="relative">
              <button
                onClick={() => setOpenGroupIdx((v) => (v === 'status' ? null : 'status'))}
                className={`flex items-center gap-1.5 h-9 pl-3 pr-2.5 text-sm rounded-lg border font-medium transition max-w-[220px] ${
                  statusFilter.length
                    ? 'border-teal bg-teal/10 text-teal'
                    : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                }`}
              >
                <span className="truncate">
                  {t('filter.statusGroup')}
                  {statusFilter.length > 0 &&
                    `: ${statusOptions.filter((s) => selectedStatusIds.has(s.id)).map((s) => s.name).join(', ')}`}
                </span>
                <ChevronDown size={14} className="shrink-0" />
              </button>

              {openGroupIdx === 'status' && (
                <div className="absolute max-w-[calc(100vw_-_1.5rem)] left-0 top-full z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5">
                  {statusOptions.map((s) => {
                    const on = selectedStatusIds.has(s.id)
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleStatusFilter(s.id)}
                        className={`flex items-center gap-1 px-3 py-1 text-sm rounded-md font-medium border whitespace-nowrap ${
                          on
                            ? 'bg-teal/10 border-transparent ring-1 ring-teal text-teal'
                            : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                        }`}
                      >
                        {s.name}
                        <span className="text-warm-400 dark:text-disc-muted">{s.count}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {(labelFilter.length > 0 || assigneeFilter.length > 0 || statusFilter.length > 0 || kindFilter.length > 0 || textQuery) && (
              <button
                onClick={() => { setLabelFilter([]); setAssigneeFilter([]); setStatusFilter([]); setKindFilter([]); setTextQuery('') }}
                className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 rounded-lg transition-colors whitespace-nowrap"
              >
                {t('filter.clear')}
              </button>
            )}
          </div>
        )}
      </div>

      {(unknownLabels.length > 0 || unknownAssignees.length > 0 || unknownBoard) && (
        <div className="rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg p-3 text-sm flex flex-wrap items-center gap-2">
          <AlertTriangle size={16} className="text-warm-400 dark:text-disc-muted shrink-0" />
          <span className="text-warm-500 dark:text-disc-muted">{t('filter.unknownNote')}</span>
          {unknownLabels.map((l) => (
            <button
              key={`l${l.id}`}
              onClick={() => setLabelFilter((prev) => prev.filter((x) => String(x.id) !== String(l.id)))}
              className="flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 transition-colors"
            >
              {t('filter.unknownLabel', { id: String(l.id) })}
              <X size={14} />
            </button>
          ))}
          {unknownBoard && (
            <button
              onClick={() => setActiveBoardId(null)}
              className="flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 transition-colors"
            >
              {t('filter.unknownBoard', { id: unknownBoard })}
              <X size={14} />
            </button>
          )}
          {unknownAssignees.map((h) => (
            <button
              key={`h${h.id}`}
              onClick={() => setAssigneeFilter((prev) => prev.filter((x) => String(x) !== String(h.id)))}
              className="flex items-center gap-1 px-3 py-1 text-sm font-medium rounded-full border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 transition-colors"
            >
              {t('filter.unknownAssignee', { id: String(h.id) })}
              <X size={14} />
            </button>
          ))}
        </div>
      )}

      {truncated && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-transparent p-3 text-sm flex flex-wrap items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          {/* ⛔ ห้าม import CARD_HARD_CAP มาโชว์ — มันอยู่ในไฟล์ที่ import pg (db/kanban/cards.js)
              ไฟล์นี้เป็น client component จะลาก pg เข้า bundle · ตอน truncated การ์ดที่ได้มา = เพดานพอดี */}
          <span className="text-warm-900 dark:text-disc-text">{t('truncated', { count: cards.length })}</span>
        </div>
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
          {(labelFilter.length || assigneeFilter.length || statusFilter.length) ? t('filter.noMatch') : t('empty.archived')}
        </div>
      ) : (
        // 2 โหมด layout เท่านั้น — **ไม่มีการปัดแนวนอนที่ไหนเลย** (user เกลียดการปัด · เคยทำ snap แบบ Trello แล้วไม่เอา)
        //   xl (≥1280): กองหารความกว้างจอเป็นคอลัมน์
        //   เล็กกว่านั้น: กองเดียวกันซ้อนลงมา กดพับ/กางได้ (แนวเดียวกับ Notion/Linear/Asana บนมือถือ)
        <div className={`flex flex-col gap-3 xl:grid xl:gap-2 ${groupBy === 'due' ? 'xl:grid-cols-5' : 'xl:grid-cols-6'}`}>
          {groups.map(({ key, cards: list }) => {
            const sorted = sortCardsBy(list, sort)
            const shown = sorted.slice(0, MAX_PER_COLUMN + (extraShown[key] || 0))
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
                    เพิ่มการ์ดลงกองนี้เลย — ตั้งแต่ 2026-08-24 มีทั้ง 2 โหมด (ปุ่มด้านบนกลายเป็น "เพิ่มกระดาน")
                      โหมดสถานะ    → กองคือ status_type ตรงๆ
                      โหมดกำหนดส่ง → กองคือช่วงเวลา แปลงเป็น due_at ให้ (defaultDueForBucket)
                    ⛔ กอง "เลยกำหนด" กับ "ไม่มีกำหนด" ไม่มีปุ่ม — งานที่เกิดมาก็สายแล้วไม่มีความหมาย
                       และกองไม่มีกำหนดส่งสร้างจากกองอื่นได้อยู่แล้ว
                    ⛔ ในกรุไม่มี — สร้างการ์ดใหม่เข้ากรุเลยไม่มีความหมาย
                  */}
                  {!inArchive && (groupBy === 'status' || defaultDueForBucket(key)) && (
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
                  {/* ⛔ การ์ดที่ผูกของจริงลากได้เฉพาะช่วงที่ต้นทางไม่ถือสถานะ (งานสื่อช่วงร่าง)
                      ปิดที่ draggable เลย ไม่ปล่อยให้ลากแล้วค่อยเด้งกลับ: ลากได้แต่ไม่มีผล = หลอกมือ
                      ⛔ เงื่อนไขอยู่ที่ isDraggableCard() ที่เดียว — ห้ามเขียนซ้ำที่นี่ ต้องตรงกับ
                         checkStatusTransition() ฝั่ง API ไม่งั้นลากได้แล้วโดนปฏิเสธเงียบๆ */}
                  {shown.map((card) => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      t={t}
                      draggable={canDrag && isDraggableCard(card)}
                      onOpen={(c) => openCard(c.ref_no ? formatRef(c.ref_no) : c.id)}
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
                    <button
                      type="button"
                      onClick={() => setExtraShown((s) => ({ ...s, [key]: (s[key] || 0) + MAX_PER_COLUMN }))}
                      className="text-sm text-teal hover:underline px-1 py-1 text-left"
                    >
                      {t('board.moreCards', { count: sorted.length - shown.length })}
                    </button>
                  )}
                  {sorted.length === 0 && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-3 text-center">
                      {(labelFilter.length || assigneeFilter.length || statusFilter.length) ? t('filter.noMatch') : t('board.emptyColumn')}
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
          onClose={closeCard}
          onChanged={load}
        />
      )}
    </div>
  )
}
