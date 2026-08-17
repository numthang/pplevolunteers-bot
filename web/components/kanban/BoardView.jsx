'use client'

/**
 * BoardView — กระดานแนวตั้ง "ย่อ" (ก่อนถึงก้อน 3)
 *
 * ⭐ ช่อง = ประเภทสถานะ 6 แบบตรงๆ ไม่มี kanban_boards/kanban_columns
 *    ลากเข้าช่อง = `PATCH { statusType }` ของเดิม → **เป็นไปไม่ได้ที่ช่องจะกลายเป็นแหล่งสถานะที่ 2**
 *    (ข้อห้ามใหญ่สุดของก้อน 3 — KANBAN.md §แบ่งก้อนงาน) เพราะช่องไม่ได้เก็บอะไรของตัวเองเลย
 *    ถึงก้อน 3 (กระดาน/ช่องตั้งเอง) หน้านี้กลายเป็น view หนึ่งได้ ไม่ต้องทิ้ง
 *
 * ⚠️ ลากด้วย HTML5 drag-and-drop = **เดสก์ท็อปเท่านั้น** (ไม่มี dnd lib ในโปรเจกต์ และไม่ควรลงเพิ่มเพื่อของแค่นี้)
 *    มือถือย้ายงานผ่านปุ่มสถานะใน CardModal — ตรงกับดีไซน์ที่ว่า "มือถือใช้ list ไม่ใช่กระดาน"
 *
 * กติกาที่ต้องไม่พัง (ฝั่ง server บังคับอยู่แล้ว ที่นี่แค่ไม่หลอกตา):
 *   - ไม่มีเจ้าภาพ = ออกจากช่อง "รอรับ" ไม่ได้ → 400 → เด้งกลับ + บอกเหตุผล
 *   - ไม่มีสิทธิ์ = 403 → เด้งกลับ + บอกเหตุผล (ห้ามเงียบ)
 *   - ก้อน 4: การ์ดที่ผูกเคส/โพสต์ห้ามลากเข้า "เสร็จ" (ต้องผ่านกล่องเผยแพร่) — ตอนนี้ยังไม่มีการ์ดแบบนั้น
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Clock, User, ListChecks, AlertTriangle, LayoutList, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { STATUS_TYPES } from '@/lib/kanbanAccess.js'
import { columnHeadProps } from '@/lib/kanbanLabelColors.js'
import CardModal from './CardModal.jsx'
import LabelChips from './LabelChips.jsx'

// แสดงต่อช่องสูงสุดเท่านี้ — ช่อง "เสร็จ" โตไม่มีเพดาน ไม่ควรวาดหมดทุกใบ
const MAX_PER_COLUMN = 40

// ⛔ เคยลองซ่อนช่อง "ยกเลิก" + กรอง "เสร็จ" เหลือ 7 วัน เพื่อให้พอดีจอ — **user ไม่เอา** (2026-08-17)
//    "ผมมีปัญหากับการใส่อะไรแล้วไม่ฟิตหน้าจอพอดี" → แก้ที่ layout ให้ 6 ช่องหารความกว้างจอเอา
//    ไม่ใช่ซ่อนข้อมูลแล้วให้คนไปกดหา · อย่าเอากลับมาใส่อีก
// หัวช่อง = พื้นพาสเทลของสถานะนั้น — สีมาจากคลังสีของ user (STATUS_COLOR ใน lib/kanbanLabelColors.js)
// **ช่องไม่มีขอบ** (user: "ไม่ชอบขอบซ้อนขอบ ตาลาย") → โครงของช่องอ่านจากแถบสีหัว ไม่ต้องมีกรอบอีกชั้น
// ⚠️ ห้ามกลับไปทำแถบสีด้วย border-t-<สี> — `dark:border-disc-border` ทับสีขอบบนทิ้งในดาร์กโหมด

function dueState(dueAt) {
  if (!dueAt) return 'none'
  const due = new Date(dueAt)
  const now = new Date()
  if (due.getTime() < now.getTime()) return 'overdue'
  if (due.toDateString() === now.toDateString()) return 'today'
  return 'upcoming'
}

function fmtDueShort(d) {
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function BoardCard({ card, t, onOpen, onDragStart, dragging }) {
  const state = dueState(card.due_at)
  const total = Number(card.checklist_total) || 0
  const done = Number(card.checklist_done) || 0

  return (
    <div
      draggable
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

      {/* ชื่อกลุ่มไม่ต้องขึ้นบนกระดาน — การ์ดแคบเกิน (ชื่อกลุ่มเต็มอยู่ใน tooltip ของชิป) */}
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
    </div>
  )
}

export default function BoardView() {
  const t = useTranslations('kanban')

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [openCardId, setOpenCardId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  // พับ/กางรายสถานะ — มีผลเฉพาะจอต่ำกว่า xl (จอใหญ่เป็นกระดาน 6 ช่อง กางเสมอ)
  // ค่าที่ไม่ได้กดเอง = auto: ช่องที่มีการ์ดกางไว้ ช่องว่างพับเก็บ
  const [openState, setOpenState] = useState({})

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch('/api/kanban/cards?view=board')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(json.error || t('loadFailed')); setCards([]); return }
      setCards(json.cards || [])
    } catch {
      setLoadError(t('loadFailed'))
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  function onDragStart(e, card) {
    setDraggingId(card.id)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox ไม่เริ่มลากเลยถ้าไม่ setData
    e.dataTransfer.setData('text/plain', String(card.id))
  }

  async function moveTo(cardId, statusType) {
    const card = cards.find((c) => String(c.id) === String(cardId))
    if (!card || card.status_type === statusType) return

    setActionError('')
    // ย้ายให้เห็นทันที แล้วค่อยยืนยันกับ server — ผิดเมื่อไหร่เด้งกลับพร้อมเหตุผล
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
        setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)))   // เด้งกลับที่เดิม
        return
      }
      // server อาจแก้อย่างอื่นด้วย (ย้ายมา backlog = ถอดเจ้าภาพ) → ใช้ของจริงที่คืนมา
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...json.card } : c)))
    } catch {
      setActionError(t('board.moveFailed'))
      setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('board.title')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('board.subtitle')}</p>
        </div>
        <Link
          href="/kanban"
          className="flex items-center gap-1.5 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2"
        >
          <LayoutList size={16} /> {t('board.viewList')}
        </Link>
      </div>

      {loadError && <p className="text-base text-red-500 dark:text-red-400">{loadError}</p>}
      {actionError && <p className="text-base text-red-500 dark:text-red-400">{actionError}</p>}

      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {t('loading')}
        </div>
      ) : (
        // 2 โหมดเท่านั้น — **ไม่มีการปัดแนวนอนที่ไหนเลย** (user เกลียดการปัด · เคยทำ snap แบบ Trello แล้วไม่เอา)
        //   xl (≥1280): กระดาน 6 ช่องหารความกว้างจอ
        //   เล็กกว่านั้น: กระดานพับลงเป็นแถวแนวตั้งซ้อนกัน หัวข้อละสถานะ กดพับ/กางได้
        //                 (แนวเดียวกับ Notion/Linear/Asana บนมือถือ) เลื่อนขึ้นลงอย่างเดียว
        // ⚠️ มือถือลากการ์ดไม่ได้ (HTML5 DnD) — เปลี่ยนสถานะโดยเปิดการ์ดแล้วกดปุ่ม (dragHint บอกไว้)
        <div className="flex flex-col gap-3 xl:grid xl:grid-cols-6 xl:gap-2">
          {STATUS_TYPES.map((status) => {
            const list = cards.filter((c) => c.status_type === status)
            const shown = list.slice(0, MAX_PER_COLUMN)
            const isOpen = openState[status] ?? list.length > 0
            return (
              <div
                key={status}
                onDragOver={(e) => { e.preventDefault(); setOverColumn(status) }}
                onDragLeave={() => setOverColumn((s) => (s === status ? null : s))}
                onDrop={(e) => {
                  e.preventDefault()
                  setOverColumn(null)
                  setDraggingId(null)
                  moveTo(e.dataTransfer.getData('text/plain'), status)
                }}
                className={`w-full xl:min-w-0 rounded-lg flex flex-col ${
                  overColumn === status ? 'bg-teal/10 dark:bg-teal/15' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenState((s) => ({ ...s, [status]: !isOpen }))}
                  style={columnHeadProps(status).style}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-left rounded-t-lg xl:cursor-default ${columnHeadProps(status).className}`}
                >
                  <h2 className="text-base font-semibold truncate">{t(`status.${status}`)}</h2>
                  <span className="flex items-center gap-1 shrink-0 text-base opacity-70">
                    {list.length}
                    {/* ลูกศรมีความหมายเฉพาะตอนพับได้ = จอเล็ก · จอใหญ่กางเสมอเลยซ่อนทิ้ง */}
                    {isOpen
                      ? <ChevronDown size={16} className="xl:hidden" />
                      : <ChevronRight size={16} className="xl:hidden" />}
                  </span>
                </button>

                {/* ไม่มี padding ในช่อง — การ์ดชิดขอบช่องพอดีแนวเดียวกับแถบหัวสี (user 2026-08-17)
                    เหลือแค่ช่องไฟระหว่างการ์ด ไม่งั้นการ์ดติดกันเป็นก้อนเดียว */}
                <div className={`${isOpen ? 'flex' : 'hidden'} xl:flex flex-col gap-2 min-h-[4rem] pt-2`}>
                  {shown.map((card) => (
                    <BoardCard
                      key={card.id}
                      card={card}
                      t={t}
                      onOpen={(c) => setOpenCardId(c.id)}
                      onDragStart={onDragStart}
                      dragging={draggingId === card.id}
                    />
                  ))}
                  {list.length > shown.length && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1">
                      {t('board.moreCards', { count: list.length - shown.length })}
                    </p>
                  )}
                  {list.length === 0 && (
                    <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-3 text-center">{t('board.emptyColumn')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-sm text-warm-400 dark:text-disc-muted">{t('board.dragHint')}</p>

      {openCardId && (
        <CardModal cardId={openCardId} onClose={() => setOpenCardId(null)} onChanged={load} />
      )}
    </div>
  )
}
