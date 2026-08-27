'use client'

/**
 * CardModal — รายละเอียดการบ้าน 1 ใบ
 *
 * กฎที่ห้ามละเมิด (CLAUDE.md):
 *   - นี่คือหน้า **Update** → autosave **ห้ามมีปุ่มบันทึก** · ต้องมีป้ายสถานะ + beforeunload แทน
 *   - ปิดได้ 3 ทางเสมอ: ปุ่ม X · ESC · คลิกนอกกล่อง
 *   - ข้อความที่ผู้ใช้เห็นทุกตัวผ่าน t()
 *
 * ⚠️ optimistic lock: PATCH ต้องส่ง lockToken ที่โหลดมา · 409 = คนอื่นแก้ไปแล้ว
 *    → ห้าม last-write-wins ให้ขึ้นแถบเตือนแล้วให้คนเลือกโหลดใหม่ (bug-071)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle, AlignLeft, Archive, ArchiveRestore, Calendar, Check, CircleDot,
  ExternalLink, Link as LinkIcon, Link2, Loader2, UserCircle, UserPlus, Users, X,
} from 'lucide-react'
import { formatRef, isDraggableCard, statusOptionsFor } from '@/lib/kanbanAccess.js'
import DeleteChoiceDialog from './DeleteChoiceDialog.jsx'
import FieldRow from './FieldRow.jsx'
import TagCombobox from './TagCombobox.jsx'
import CardFieldsBox from './CardFieldsBox.jsx'
import PersonProfileModal from './PersonProfileModal.jsx'

const AUTOSAVE_MS = 800

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

export default function CardModal({ cardId, onClose, onChanged }) {
  const t = useTranslations('kanban')

  const [card, setCard] = useState(null)
  const [can, setCan] = useState({ edit: false, archive: false, restore: false, claim: false, join: false, purge: false })
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [profileUserId, setProfileUserId] = useState(null)
  // ตัวเลือกสถานะ — ป้ายมาจาก t() จึงคำนวณที่นี่ ไม่ใช่ค่าคงที่นอก component
  // การบ้านธรรมดาได้ครบ 6 แบบ · การ์ดที่ผูกงานสื่อได้เฉพาะช่วงร่าง (statusOptionsFor)
  const STATUS_OPTIONS = statusOptionsFor(card).map((s) => ({ id: s, name: t(`status.${s}`) }))
  const [removing, setRemoving] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // ฟิลด์ที่ autosave
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [dueAt, setDueAt] = useState('')

  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved
  const [pendingSave, setPendingSave] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [actionError, setActionError] = useState('')

  const lockToken = useRef(null)
  const saveTimer = useRef(null)
  const detailRef = useRef(null)
  // ค่าที่ "ตรงกับ DB ตอนนี้" — autosave ยิงต่อเมื่อค่าปัจจุบันต่างจากนี้เท่านั้น
  //
  // ⛔ ห้ามใช้ ref แบบ loadedOnce แทน (เคยเขียนแบบนั้นแล้วพัง 2026-08-15):
  //    ref ถูกเซ็ตใน load() ทันที แต่ effect ที่เฝ้า title/detail ทำงานหลัง React commit ค่า
  //    → ตอน effect ทำงาน guard ผ่านไปแล้ว = เปิดการ์ดเฉยๆ ก็ยิง PATCH + ขยับ updated_at
  //      (ทำให้คนอื่นที่เปิดค้างอยู่โดน 409 ฟรีๆ)
  const baseline = useRef(null)

  // timestamptz จาก API → ค่าที่ input datetime-local รับได้ (เวลาไทย ไม่ใช่ UTC)
  function toLocalInput(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(json.error || t('loadFailed')); return }
      setCard(json.card)
      setCan(json.can || {})
      lockToken.current = json.card.lock_token
      // เขียนทับช่องกรอกเฉพาะตอนโหลดครั้งแรก/กดโหลดใหม่ — ไม่งั้นทับสิ่งที่กำลังพิมพ์
      const fresh = {
        title: json.card.title || '',
        detail: json.card.detail || '',
        dueAt: toLocalInput(json.card.due_at),
      }
      baseline.current = fresh
      setTitle(fresh.title)
      setDetail(fresh.detail)
      setDueAt(fresh.dueAt)
      setConflict(false)
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [cardId, t])

  useEffect(() => { load() }, [load])

  // ขยายช่อง detail ตามความยาวข้อความ — ยิงตอนโหลดค่าจริงมาด้วย ไม่ใช่แค่ตอนพิมพ์
  useEffect(() => { autoGrow(detailRef.current) }, [loading, detail])

  /**
   * ปิด 3 ทาง — ทางที่ 1: ESC
   *
   * ⚠️ **ESC ตอนกำลังแก้อะไรอยู่ = ยกเลิกการแก้ชิ้นนั้น ไม่ใช่ปิดทั้งกล่อง** (user สั่ง 2026-08-20)
   *    ตัวแก้แต่ละที่ `stopPropagation()` ของตัวเองอยู่แล้ว แต่**ลืมง่ายมาก** — รอบนี้เจอที่ลืม 5 จุด
   *    (ชื่อ field · ค่า scalar · ฟอร์มเพิ่ม field · dropdown ของ TagCombobox · ช่องชื่อการบ้าน)
   *    ด่านนี้จึงกันซ้ำอีกชั้นแบบไม่ต้องพึ่งความจำ: **โฟกัสอยู่ในของที่แก้ได้ = ไม่ปิดกล่อง**
   *    ใครเพิ่มช่องกรอกใหม่ในอนาคตก็ปลอดภัยโดยอัตโนมัติ
   */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = document.activeElement
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = useCallback(async () => {
    if (!card || !can.edit) { setPendingSave(false); return }
    setPendingSave(false)
    setSaveState('saving')
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lockToken: lockToken.current,
          title,
          detail,
          dueAt: dueAt || null,        // ⚠️ ส่งดิบ ห้ามแปลงผ่าน toISOString()
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) { setConflict(true); setSaveState('idle'); return }
      if (!res.ok) { setActionError(json.error || t('saveFailed')); setSaveState('idle'); return }
      lockToken.current = json.card.lock_token
      // ค่าที่เพิ่งเซฟสำเร็จ = baseline ใหม่ ไม่งั้น effect เห็นว่ายัง dirty แล้ววนเซฟไม่จบ
      baseline.current = { title, detail, dueAt }
      setCard(json.card)
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      onChanged?.()
    } catch {
      setSaveState('idle')
    }
  }, [card, can.edit, cardId, title, detail, dueAt, t, onChanged])

  // autosave — ยิงต่อเมื่อค่าต่างจากที่โหลดมาจริงๆ
  // (เปิดกล่องเฉยๆ / กดโหลดใหม่ / พิมพ์แล้วลบกลับเป็นค่าเดิม = ไม่ยิง)
  useEffect(() => {
    if (!can.edit || !baseline.current) return
    const b = baseline.current
    const dirty = title !== b.title || detail !== b.detail || dueAt !== b.dueAt
    if (!dirty) { setPendingSave(false); return }

    clearTimeout(saveTimer.current)
    setPendingSave(true)
    saveTimer.current = setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, detail, dueAt, can.edit])

  // ไม่มีปุ่มบันทึก → ด่านเดียวที่กันงานหายคือตรงนี้ (กฎ CLAUDE.md §กฎการบันทึก)
  useEffect(() => {
    if (!pendingSave && saveState !== 'saving') return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingSave, saveState])

  // ปิดกล่องตอนยังเซฟไม่เสร็จ = ถามก่อน (beforeunload ไม่ครอบเคสนี้ เพราะไม่ได้ปิดแท็บ)
  function requestClose() {
    if (pendingSave || saveState === 'saving') {
      if (!window.confirm(t('modal.confirmCloseUnsaved'))) return
    }
    onClose()
  }

  /** ค้นคนใน org ให้ combobox ของเจ้าภาพ/คนช่วย — ⚠️ ค้นเท่านั้น ห้าม dump (org มี 7,376 คน) */
  const searchPeople = useCallback(async (q) => {
    if (!q || q.trim().length < 2) return []
    const res = await fetch(`/api/kanban/people?q=${encodeURIComponent(q.trim())}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.people || []).map((p) => ({
      id: String(p.userId),
      name: p.name,
      // @username โชว์เป็นบรรทัดรองในลิสต์เท่านั้น — ห้ามต่อเข้าไปในชื่อ ไม่งั้นชิปบนการ์ดติด "(@…)" ไปด้วย
      sub: p.username ? `@${p.username}` : null,
    }))
  }, [])

  /**
   * คนช่วย — combobox ส่ง "ชุดใหม่ทั้งชุด" มา แต่ API มีแค่เพิ่ม/ถอดทีละคน
   * → เทียบกับชุดเดิมแล้วยิงเฉพาะส่วนต่าง (ยิงทั้งชุดทุกครั้ง = ถอดแล้วเพิ่มคนเดิมซ้ำ)
   */
  async function commitHelpers(ids) {
    setActionError('')
    const before = new Set((card.helpers || []).map((h) => String(h.user_id)))
    const after = new Set(ids.map(String))
    const added = [...after].filter((id) => !before.has(id))
    const removed = [...before].filter((id) => !after.has(id))

    let latest = null
    try {
      for (const id of added) {
        const res = await fetch(`/api/kanban/cards/${cardId}/helpers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: Number(id) }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setActionError(json.error || t('saveFailed')); return }
        latest = json.card
      }
      for (const id of removed) {
        const res = await fetch(`/api/kanban/cards/${cardId}/helpers?userId=${id}`, { method: 'DELETE' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setActionError(json.error || t('saveFailed')); return }
        latest = json.card
      }
      if (latest) { setCard(latest); onChanged?.() }
    } catch {
      setActionError(t('saveFailed'))
    }
  }

  async function patch(body) {
    setActionError('')
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('saveFailed')); return }
      setCard(json.card)
      lockToken.current = json.card.lock_token
      onChanged?.()
    } catch {
      setActionError(t('saveFailed'))
    }
  }

  /**
   * เก็บเข้ากรุ / ลบถาวร — เลือกในกล่องเดียวกัน (ลอกแบบ posts · user สั่ง 2026-08-18)
   * ⛔ ห้ามกลับไปบังคับ "เข้ากรุก่อนแล้วค่อยลบ"
   */
  async function removeCard(permanent) {
    setActionError('')
    setRemoving(true)
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}${permanent ? '?purge=1' : ''}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setActionError(json.error || t('saveFailed'))
        return
      }
      setConfirmRemove(false)
      onChanged?.()
      onClose()
    } finally {
      setRemoving(false)
    }
  }

  /**
   * คัดลอกลิงก์ตรงเข้าการ์ดใบนี้ (user เคาะ 2026-08-28 — เลือกลิงก์ แทน "open as full page" ของ AppFlowy)
   *
   * URL = หน้าที่เปิดอยู่ตอนนี้ + `?card=<id>` · คนที่กดลิงก์จะได้กระดาน/ตัวกรองชุดเดียวกับคนแชร์
   * ⚠️ `navigator.clipboard` ใช้ได้เฉพาะ secure context (https / localhost) — บนอย่างอื่นจะ throw
   *    จึงต้องมีทางลง: บอกไปตรงๆ ว่าคัดลอกไม่ได้ ดีกว่าเงียบแล้วผู้ใช้ไปแปะแล้วได้ของเก่าในคลิปบอร์ด
   */
  async function copyLink() {
    const url = new URL(window.location.href)
    url.searchParams.set('card', String(cardId))
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setActionError(t('modal.copyLinkFailed'))
    }
  }

  /**
   * "ลงมือด้วย" / "รับงานนี้" — ทางเดียวที่คนนอกเข้ามาร่วมงานเองได้ (user เคาะ 2026-08-27)
   *
   * ⭐ ปุ่มเดียวทำได้ 2 อย่าง เพราะ **server เป็นคนตัดสิน** จาก `{claim:true}`:
   *    ยังไม่มีเจ้าภาพ → กลายเป็นเจ้าภาพ · มีเจ้าภาพแล้ว → ต่อท้ายเป็นคนช่วย
   *    (ดู PATCH ที่ api/kanban/cards/[id]/route.js §claim) — client ห้ามเดาเองว่าจะได้บทไหน
   *
   * ⚠️ ต้อง `load()` ไม่ใช่ `setCard()` เฉยๆ — `can` มาจาก GET ครั้งแรกที่เดียว
   *    กดแล้วกลายเป็นคนช่วย = `can.edit` ต้องพลิกเป็น true ทันที ไม่งั้นเข้ามาแล้วยังแก้อะไรไม่ได้
   *    ปลอดภัยที่จะทับช่องกรอก เพราะคนที่เห็นปุ่มนี้ยังอยู่โหมดอ่านอย่างเดียว ไม่มีอะไรพิมพ์ค้าง
   */
  async function join() {
    setActionError('')
    setJoining(true)
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setActionError(json.error || t('actions.claimFailed')); return }
      await load()
      onChanged?.()
    } catch {
      setActionError(t('actions.claimFailed'))
    } finally {
      setJoining(false)
    }
  }

  /** เอาออกจากกรุ — ไม่ต้องถามยืนยัน เป็นการกระทำที่ย้อนได้อยู่แล้ว */
  async function restore() {
    const res = await fetch(`/api/kanban/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restore: true }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setActionError(json.error || t('actions.restoreFailed'))
      return
    }
    onChanged?.()
    onClose()
  }

  const readOnly = !can.edit
  // ⭐ การ์ดที่ผูกเคส/โพสต์: **ชื่อกับสถานะเป็นของต้นทาง** แก้ที่นี่ไม่ได้ (user เคาะ 2026-08-24)
  //    ที่เหลือ (รายละเอียด · เจ้าภาพ · กำหนดส่ง · คนช่วย · ป้าย) ยังแก้ได้ตามปกติ — เป็นข้อมูลของ kanban เอง
  //    API ก็ปฏิเสธอยู่แล้ว แต่ต้องปิดที่ UI ด้วย ไม่งั้นพิมพ์ไปทั้งย่อหน้าแล้วค่อยเด้ง error = เสียของ
  const linked = card?.link || null

  return (
    // ปิด 3 ทาง — ทางที่ 2: คลิกนอกกล่อง
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg w-full max-w-2xl my-auto">
        <div className="flex items-start justify-between gap-2 p-6 border-b border-warm-200 dark:border-disc-border">
          {/* ⛔ เดิมมี h2 "รายละเอียดการบ้าน" ใต้เลข — ถอดออก 2026-08-28 (user: ไม่บอกอะไรที่คนยังไม่รู้)
              เลข K-xx ขึ้นมาเป็นหัวเรื่องแทน เพราะเป็นสิ่งเดียวในหัวกล่องที่ระบุว่า "ใบไหน"
              (ชื่อการบ้านแก้ได้ในตัวกล่องอยู่แล้ว จึงไม่เอามาซ้ำที่หัว) */}
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">{card ? formatRef(card.ref_no) : ''}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* ป้ายสถานะการเซฟ — แทนปุ่มบันทึกที่ถูกยกเลิกไปตามกฎ 2026-07-30 */}
            <span className="flex items-center gap-1 text-base text-warm-500 dark:text-disc-muted">
              {saveState === 'saving' && <><Loader2 size={16} className="animate-spin" /> {t('modal.saving')}</>}
              {saveState === 'saved' && <><Check size={16} className="text-green-600" /> {t('modal.saved')}</>}
            </span>
            {/* คัดลอกลิงก์ตรงเข้าการ์ดใบนี้ — user เคาะ 2026-08-28: เอาลิงก์ ไม่เอา "open as full page"
                ⚠️ ต้องอ่านจาก window.location ตอนกด ไม่ใช่ประกอบตอน render — ผู้ใช้อาจอยู่คนละกระดาน/
                   คนละตัวกรอง และ URL ที่แชร์ควรพาไปที่ "หน้าเดียวกับที่คนแชร์เห็น" พร้อมการ์ดใบนี้เปิดอยู่ */}
            <button
              onClick={copyLink}
              aria-label={t('modal.copyLink')}
              title={t('modal.copyLink')}
              className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
            >
              {copied ? <Check size={20} className="text-green-600" /> : <LinkIcon size={20} />}
            </button>
            {/* ปิด 3 ทาง — ทางที่ 3: ปุ่ม X */}
            <button
              onClick={requestClose}
              aria-label={t('modal.closeTitle')}
              title={t('modal.closeTitle')}
              className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {loading && <p className="text-base text-warm-400 dark:text-disc-muted">{t('loading')}</p>}
          {loadError && <p className="text-base text-red-500 dark:text-red-400">{loadError}</p>}

          {conflict && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-transparent p-3 text-sm flex flex-wrap items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <span className="text-warm-900 dark:text-disc-text">{t('modal.conflict')}</span>
              <button onClick={load} className="underline font-medium text-warm-900 dark:text-disc-text">
                {t('modal.reload')}
              </button>
            </div>
          )}

          {card && (
            <>
              {linked && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-teal/10 text-sm text-warm-900 dark:text-disc-text">
                  <Link2 size={16} className="text-teal shrink-0" />
                  <span>
                    {t('linked.banner', { kind: t(`linked.kind.${linked.entity_type}`) })}
                    {linked.ref ? ` (${linked.ref})` : ''}
                  </span>
                  <a
                    href={linked.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-medium text-teal hover:underline"
                  >
                    {t('linked.open')} <ExternalLink size={14} />
                  </a>
                </div>
              )}

              {card.source_url && (
                <a
                  href={card.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 w-fit text-sm text-warm-400 dark:text-disc-muted hover:text-teal hover:underline"
                >
                  <ExternalLink size={14} /> {t('modal.sourceLink')}
                </a>
              )}

              {/* ชื่อการบ้าน = หัวเรื่อง ไม่ใช่แถว label|ค่า (แนวเดียวกับ Notion ที่ title อยู่บนสุดตัวใหญ่) */}
              <input
                type="text"
                value={title}
                disabled={readOnly || Boolean(linked)}
                title={linked ? t('linked.titleLocked', { kind: t(`linked.kind.${linked.entity_type}`) }) : undefined}
                onChange={(e) => setTitle(e.target.value)}
                /* ESC = คืนค่าที่เซฟไว้ล่าสุดแล้วออกจากช่อง (ไม่ปิดกล่อง) — autosave จะไม่ยิงเพราะค่าเท่า baseline */
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return
                  e.stopPropagation()
                  setTitle(baseline.current?.title ?? '')
                  e.currentTarget.blur()
                }}
                placeholder={t('form.titleLabel')}
                className="w-full px-0 text-2xl font-semibold rounded-lg bg-transparent text-warm-900 dark:text-disc-text placeholder-warm-300 dark:placeholder-disc-muted border-none focus:outline-none focus:ring-0 disabled:opacity-60"
              />

              {/*
                ทุกอย่างใต้นี้เป็นแถว `[ไอคอน · ชื่อ] | [ค่า]` ตัวเดียวกับ custom field (FieldRow.jsx)
                user: "เปลี่ยนหมดทั้ง modal เลย" (2026-08-18)
                ⛔ ห้ามเขียน grid ซ้ำเอง — คอลัมน์ซ้ายต้องกว้างเท่ากับของ CardFieldsBox เป๊ะ
              */}
              <div className="flex flex-col gap-0.5">
                <FieldRow icon={AlignLeft} label={t('form.detailLabel')}>
                  <textarea
                    ref={detailRef}
                    value={detail}
                    disabled={readOnly}
                    onChange={(e) => { setDetail(e.target.value); autoGrow(e.target) }}
                    /* ESC = คืนค่าที่เซฟไว้ล่าสุดแล้วออกจากช่อง (ไม่ปิดกล่อง) */
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return
                      e.stopPropagation()
                      setDetail(baseline.current?.detail ?? '')
                      e.currentTarget.blur()
                    }}
                    rows={3}
                    placeholder={t('modal.fieldEmpty')}
                    className="w-full px-2 -mx-2 py-2 text-base rounded-lg border border-transparent bg-transparent text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover focus:outline-none focus:bg-card-bg focus:border-warm-200 dark:focus:border-disc-border focus:ring-2 focus:ring-teal resize-none overflow-hidden disabled:opacity-60 transition"
                  />
                </FieldRow>

                <FieldRow icon={Calendar} label={t('form.dueAtLabel')}>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    disabled={readOnly}
                    onChange={(e) => setDueAt(e.target.value)}
                    /* ESC = คืนค่าที่เซฟไว้ล่าสุดแล้วออกจากช่อง (ไม่ปิดกล่อง) */
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return
                      e.stopPropagation()
                      setDueAt(baseline.current?.dueAt ?? '')
                      e.currentTarget.blur()
                    }}
                    className="h-11 px-2 -mx-2 text-base rounded-lg border border-transparent bg-transparent text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover focus:outline-none focus:bg-card-bg focus:border-warm-200 dark:focus:border-disc-border focus:ring-2 focus:ring-teal disabled:opacity-60 transition"
                  />
                </FieldRow>

                {/* เจ้าภาพ — select ทรงเดียวกับ custom field แต่ตัวเลือกแก้ไม่ได้ (คนใน org ค้นเอา ไม่ใช่พิมพ์เอง)
                    ⛔ readOnly ผูกกับ can.edit อย่างเดียว — **ห้ามเติม `|| can.claim` กลับมา**
                       onCommit ยิง { ownerUserId } ซึ่งด่านคือ canAssignOwner = คนเกี่ยวข้องเท่านั้น
                       เติมเมื่อไหร่ = คนนอกเปิดช่องเลือกได้ เลือกเสร็จเด้ง 403 (บั๊กจริงถึง 2026-08-27)
                       ทางของคนนอกคือปุ่ม "ลงมือด้วย" ท้ายกล่อง ซึ่งยิง { claim:true } คนละ path กัน */}
                <FieldRow icon={UserCircle} label={t('modal.ownerLabel')}>
                  <TagCombobox
                    type="select"
                    numericIds={false}
                    readOnly={!can.edit}
                    placeholder={t('modal.noOwner')}
                    source={{ mode: 'search', search: searchPeople }}
                    value={card.owner_user_id ? [{ id: String(card.owner_user_id), name: card.owner_name || '' }] : []}
                    onCommit={(ids) => patch({ ownerUserId: ids[0] ? Number(ids[0]) : null })}
                    onError={setActionError}
                    onOpenProfile={(id) => setProfileUserId(id)}
                    t={t}
                  />
                </FieldRow>

                {/* สถานะ — select ทรงเดียวกับ custom field · ตัวเลือกตายตัว 6 แบบ เพิ่ม/ลบไม่ได้
                    ⛔ การ์ดที่ผูกของจริง: อ่านสดจากต้นทาง แก้ที่นี่ไม่ได้ — ไปเปลี่ยนที่หน้านั้นแล้วมันขยับเอง */}
                <FieldRow icon={CircleDot} label={t('modal.statusLabel')}>
                  <TagCombobox
                    type="select"
                    numericIds={false}
                    readOnly={readOnly || !isDraggableCard(card)}
                    source={{ mode: 'static', options: STATUS_OPTIONS }}
                    value={card.status_type ? [{ id: card.status_type, name: t(`status.${card.status_type}`) }] : []}
                    onCommit={(ids) => (ids[0] ? patch({ statusType: ids[0] }) : undefined)}
                    onError={setActionError}
                    t={t}
                  />
                </FieldRow>
                {/* คำเตือน "ไปเปลี่ยนที่ต้นทาง" ขึ้นเฉพาะตอนที่แก้ที่นี่ไม่ได้จริงๆ —
                    งานสื่อช่วงร่างแก้ได้แล้ว (kanban ถือสถานะช่วงนั้น) ขึ้นไปก็สับสนเปล่า */}
                {linked && !isDraggableCard(card) && (
                  <p className="pl-7 -mt-0.5 text-xs text-warm-400 dark:text-disc-muted">
                    {t('linked.statusHint', { kind: t(`linked.kind.${linked.entity_type}`) })}
                  </p>
                )}

                {/* ⛔ แถว "ป้าย" ถูกถอดออก 2026-08-19 — ยุบเข้า custom field แล้ว
                    สายงาน/พื้นที่/อุปกรณ์ ขึ้นเป็นแถว field ปกติในกล่อง "ข้อมูลของทีม" ข้างล่างแทน
                    อย่าเอากลับมา: มีที่เก็บ 2 ที่เมื่อไหร่ ข้อมูลใหม่จะแตกไปคนละทางทันที */}

                {/* คนช่วย — multi_select ทรงเดียวกับ custom field · ตัวเลือกคือคนใน org ค้นเอา */}
                <FieldRow icon={Users} label={t('modal.helpersLabel')}>
                  <TagCombobox
                    type="multi_select"
                    numericIds={false}
                    readOnly={!can.edit}
                    placeholder={t('modal.noHelpers')}
                    source={{ mode: 'search', search: searchPeople }}
                    value={(card.helpers || []).map((h) => ({ id: String(h.user_id), name: h.name }))}
                    onCommit={commitHelpers}
                    onError={setActionError}
                    onOpenProfile={(id) => setProfileUserId(id)}
                    t={t}
                  />
                </FieldRow>
              </div>

              {profileUserId && (
                <PersonProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} t={t} />
              )}

              {/* ข้อมูลของทีม — custom field (รวมเช็คลิสต์แล้ว 2026-08-18 รอบเย็น) แยกกายภาพจากของระบบข้างบน */}
              <CardFieldsBox
                cardId={cardId}
                fields={card.fields || []}
                readOnly={readOnly}
                canPurge={Boolean(can.purge)}
                onError={setActionError}
                // ซ่อน/เอากลับ/เปลี่ยนชื่อ/ลบ field → รายการ field ของการ์ดเปลี่ยนไปทั้งชุด ต้องโหลดการ์ดใหม่
                // (แก้ค่าเฉยๆ ใช้ onFieldValueChanged ที่เบากว่า — ตรงนี้คือโครงเปลี่ยน ไม่ใช่ค่าเปลี่ยน)
                onFieldsChanged={() => { load(); onChanged?.() }}
                onCardChanged={(fresh) => {
                  setCard(fresh)
                  lockToken.current = fresh.lock_token
                  onChanged?.()
                }}
                onFieldValueChanged={(fieldId, value) => {
                  setCard((prev) => ({
                    ...prev,
                    fields: (prev.fields || []).map((f) => (f.field_id === fieldId ? { ...f, value } : f)),
                  }))
                  // แจ้งหน้ารายการด้วย — ไม่งั้นป้าย checklist บนหน้ากระดาน (KanbanHome) ค้างเลขเดิมจนกว่าจะปิดเปิดการ์ดใหม่
                  onChanged?.()
                }}
                onFieldAdded={(field) => {
                  // ต่อเข้า state ตรงๆ — ห้ามเรียก load() เพราะจะเขียนทับช่องที่ยังพิมพ์ค้างไม่ได้เซฟ
                  setCard((prev) => ({ ...prev, fields: [...(prev.fields || []), field] }))
                }}
                t={t}
              />

              {actionError && <p className="text-base text-red-500 dark:text-red-400">{actionError}</p>}

              {/* เก็บเข้ากรุ = archive (กู้คืนได้จาก "แสดง: กรุ") · ลบถาวรอยู่ในโหมดกรุเท่านั้น ไม่ใช่ที่นี่
                  การ์ดที่อยู่ในกรุอยู่แล้ว can.archive เป็น false และได้ can.restore แทน
                  ⛔ ปุ่ม "ทำสำเนา" ย้ายไปเมนู "..." บนการ์ดในกระดานแล้ว (user สั่ง 2026-08-19) */}
              {/* ปุ่มนี้โผล่เสมอเมื่อโหลดการ์ดได้ — API ใช้ด่าน canViewCard (เห็นได้ = ก๊อปได้)
                  ไม่ผูกกับ can.edit เพราะสำเนาเป็นการ์ดใบใหม่ของคนกด ไม่ได้แตะต้นฉบับ */}
              {/* ⭐ ทุกปุ่มในแถวนี้ผูกกับ can.* ที่ API คำนวณมา — ห้ามโผล่ปุ่มที่กดแล้วได้ 403
                  (กติกาเดียวกับ statusOptionsFor: "ตัวเลือกที่เลือกไม่ได้ต้องไม่โผล่ ไม่ใช่โผล่แล้วกดไม่ได้")
                  เดิมปุ่ม "เก็บเข้ากรุ" โผล่ให้ทุกคนทั้งที่ด่านคือคนสร้าง/admin เท่านั้น */}
              {(can.restore || can.archive || can.join) && (
                <div className="pt-2 border-t border-warm-200 dark:border-disc-border flex flex-wrap items-center justify-between gap-2">
                  {can.restore ? (
                    <button onClick={restore} className="flex items-center gap-1 px-4 py-2 text-base rounded-lg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium transition">
                      <ArchiveRestore size={16} /> {t('actions.restore')}
                    </button>
                  ) : can.archive ? (
                    <button onClick={() => setConfirmRemove(true)} className="flex items-center gap-1 px-4 py-2 text-base rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-disc-hover font-medium transition">
                      <Archive size={16} /> {t('modal.archive')}
                    </button>
                  ) : <span />}

                  {/* ป้ายเปลี่ยนตามบทที่จะได้: ยังไม่มีเจ้าภาพ = "รับงานนี้" · มีแล้ว = "ลงมือด้วย"
                      ⚠️ เป็นแค่ป้าย — คนตัดสินจริงคือ server (ดู join()) ห้ามเอาเงื่อนไขนี้ไปตัดสินอะไรอย่างอื่น */}
                  {can.join && (
                    <button
                      onClick={join}
                      disabled={joining}
                      className="flex items-center gap-1.5 px-4 py-2 text-base rounded-lg bg-teal text-white font-medium hover:opacity-90 disabled:opacity-50 transition"
                    >
                      {joining
                        ? <Loader2 size={16} className="animate-spin" />
                        : <UserPlus size={16} />}
                      {joining
                        ? t('actions.claiming')
                        : card.owner_user_id ? t('modal.joinAsHelper') : t('actions.claim')}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {confirmRemove && (
        <DeleteChoiceDialog
          t={t}
          heading={t('actions.deleteCardHeading')}
          title={card?.title || ''}
          impact={t('actions.cardImpactPlain')}
          hideHint={t('actions.cardArchiveHint')}
          hideLabel={t('actions.archive')}
          canPurge={Boolean(can.purge)}
          busy={removing}
          onClose={() => setConfirmRemove(false)}
          onHide={() => removeCard(false)}
          onPurge={() => removeCard(true)}
        />
      )}
    </div>
  )
}
