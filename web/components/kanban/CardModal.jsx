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
import { X, Loader2, Check, Trash2, Plus, AlertTriangle, UserPlus } from 'lucide-react'
import { formatRef, STATUS_TYPES } from '@/lib/kanbanAccess.js'

const AUTOSAVE_MS = 800

export default function CardModal({ cardId, onClose, onChanged }) {
  const t = useTranslations('kanban')

  const [card, setCard] = useState(null)
  const [checklist, setChecklist] = useState([])
  const [can, setCan] = useState({ edit: false, archive: false, claim: false })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // ฟิลด์ที่ autosave
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [blockedReason, setBlockedReason] = useState('')

  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved
  const [pendingSave, setPendingSave] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [actionError, setActionError] = useState('')
  const [newItem, setNewItem] = useState('')

  const lockToken = useRef(null)
  const saveTimer = useRef(null)
  const loadedOnce = useRef(false)

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
      setChecklist(json.checklist || [])
      setCan(json.can || {})
      lockToken.current = json.card.lock_token
      // เขียนทับช่องกรอกเฉพาะตอนโหลดครั้งแรก/กดโหลดใหม่ — ไม่งั้นทับสิ่งที่กำลังพิมพ์
      setTitle(json.card.title || '')
      setDetail(json.card.detail || '')
      setDueAt(toLocalInput(json.card.due_at))
      setBlockedReason(json.card.blocked_reason || '')
      setConflict(false)
      loadedOnce.current = true
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [cardId, t])

  useEffect(() => { load() }, [load])

  // ปิด 3 ทาง — ทางที่ 1: ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
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
          blockedReason: blockedReason || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) { setConflict(true); setSaveState('idle'); return }
      if (!res.ok) { setActionError(json.error || t('saveFailed')); setSaveState('idle'); return }
      lockToken.current = json.card.lock_token
      setCard(json.card)
      setSaveState('saved')
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500)
      onChanged?.()
    } catch {
      setSaveState('idle')
    }
  }, [card, can.edit, cardId, title, detail, dueAt, blockedReason, t, onChanged])

  // autosave — ไม่ยิงตอนโหลดครั้งแรก (ไม่งั้นเปิดกล่องเฉยๆ ก็เขียน DB)
  useEffect(() => {
    if (!loadedOnce.current || !can.edit) return
    clearTimeout(saveTimer.current)
    setPendingSave(true)
    saveTimer.current = setTimeout(save, AUTOSAVE_MS)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, detail, dueAt, blockedReason])

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

  async function checklistCall(method, body, query = '') {
    setActionError('')
    const res = await fetch(`/api/kanban/cards/${cardId}/checklist${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setActionError(json.error || t('saveFailed')); return null }
    const list = await fetch(`/api/kanban/cards/${cardId}/checklist`).then((r) => r.json()).catch(() => ({}))
    setChecklist(list.items || [])
    onChanged?.()
    return json
  }

  async function addItem(e) {
    e.preventDefault()
    const text = newItem.trim()
    if (!text) return
    if (await checklistCall('POST', { text })) setNewItem('')
  }

  async function archive() {
    if (!window.confirm(t('modal.confirmArchive'))) return
    const res = await fetch(`/api/kanban/cards/${cardId}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setActionError(json.error || t('saveFailed'))
      return
    }
    onChanged?.()
    onClose()
  }

  const readOnly = !can.edit

  return (
    // ปิด 3 ทาง — ทางที่ 2: คลิกนอกกล่อง
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl w-full max-w-2xl my-auto">
        <div className="flex items-start justify-between gap-2 p-4 border-b border-warm-200 dark:border-disc-border">
          <div className="min-w-0">
            <span className="text-xs text-warm-400 dark:text-disc-muted">{card ? formatRef(card.ref_no) : ''}</span>
            <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">{t('modal.title')}</h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* ป้ายสถานะการเซฟ — แทนปุ่มบันทึกที่ถูกยกเลิกไปตามกฎ 2026-07-30 */}
            <span className="flex items-center gap-1 text-xs text-warm-500 dark:text-disc-muted">
              {saveState === 'saving' && <><Loader2 size={14} className="animate-spin" /> {t('modal.saving')}</>}
              {saveState === 'saved' && <><Check size={14} className="text-green-600" /> {t('modal.saved')}</>}
            </span>
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

        <div className="p-4 flex flex-col gap-4">
          {loading && <p className="text-sm text-warm-400 dark:text-disc-muted">{t('loading')}</p>}
          {loadError && <p className="text-sm text-red-500 dark:text-red-400">{loadError}</p>}

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
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.titleLabel')}</label>
                <input
                  type="text"
                  value={title}
                  disabled={readOnly}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.detailLabel')}</label>
                <textarea
                  value={detail}
                  disabled={readOnly}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal resize-none disabled:opacity-60"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('form.dueAtLabel')}</label>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    disabled={readOnly}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                  />
                </div>
                <div className="min-w-[10rem]">
                  <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('modal.ownerLabel')}</label>
                  <p className="h-11 flex items-center text-base text-warm-900 dark:text-disc-text">
                    {card.owner_name || t('modal.noOwner')}
                  </p>
                </div>
              </div>

              {/* สถานะ — ปุ่มเรียงตามลำดับงานจริง ไม่ใช่ dropdown (แตะง่ายบนมือถือ) */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('modal.statusLabel')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_TYPES.map((s) => (
                    <button
                      key={s}
                      disabled={readOnly}
                      onClick={() => patch({ statusType: s })}
                      className={`px-3 py-1.5 text-sm rounded-lg border font-medium disabled:opacity-50 ${
                        card.status_type === s
                          ? 'bg-teal text-white border-transparent'
                          : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {t(`status.${s}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ติดปัญหา — เป็นธง ไม่ใช่สถานะ (ดีไซน์ §ประเภทสถานะ) */}
              <div>
                <label className="flex items-center gap-2 text-sm text-warm-700 dark:text-disc-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(card.blocked)}
                    disabled={readOnly}
                    onChange={(e) => patch({ blocked: e.target.checked })}
                    className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer"
                  />
                  {t('modal.blockedLabel')}
                </label>
                {card.blocked && (
                  <input
                    type="text"
                    value={blockedReason}
                    disabled={readOnly}
                    onChange={(e) => setBlockedReason(e.target.value)}
                    placeholder={t('modal.blockedReasonPlaceholder')}
                    className="mt-2 w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"
                  />
                )}
              </div>

              {/* คนช่วย */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('modal.helpersLabel')}</label>
                <div className="flex flex-wrap items-center gap-2">
                  {(card.helpers || []).length === 0 && (
                    <span className="text-sm text-warm-400 dark:text-disc-muted">{t('modal.noHelpers')}</span>
                  )}
                  {(card.helpers || []).map((h) => (
                    <span key={h.user_id} className="flex items-center gap-1 px-2 py-1 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text">
                      {h.name}
                    </span>
                  ))}
                  {can.join && (
                    <button
                      onClick={async () => {
                        setActionError('')
                        const res = await fetch(`/api/kanban/cards/${cardId}/helpers`, { method: 'POST' })
                        const json = await res.json().catch(() => ({}))
                        if (!res.ok) { setActionError(json.error || t('saveFailed')); return }
                        setCard(json.card); onChanged?.()
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover"
                    >
                      <UserPlus size={14} /> {t('modal.joinAsHelper')}
                    </button>
                  )}
                </div>
              </div>

              {/* งานย่อย */}
              <div>
                <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">
                  {t('modal.checklistLabel')}
                  {checklist.length > 0 && ` · ${checklist.filter((i) => i.done).length}/${checklist.length}`}
                </label>
                <div className="flex flex-col gap-1.5">
                  {checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={readOnly}
                        onChange={(e) => checklistCall('PATCH', { itemId: item.id, done: e.target.checked })}
                        className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer"
                      />
                      <span className={`flex-1 text-base ${item.done ? 'line-through text-warm-400 dark:text-disc-muted' : 'text-warm-900 dark:text-disc-text'}`}>
                        {item.text}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => checklistCall('DELETE', null, `?itemId=${item.id}`)}
                          aria-label={t('modal.removeItem')}
                          title={t('modal.removeItem')}
                          className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <form onSubmit={addItem} className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newItem}
                      onChange={(e) => setNewItem(e.target.value)}
                      placeholder={t('modal.addItemPlaceholder')}
                      className="flex-1 h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <button type="submit" className="flex items-center gap-1 px-3 rounded-lg bg-teal text-white text-sm font-medium hover:opacity-90">
                      <Plus size={16} /> {t('modal.addItem')}
                    </button>
                  </form>
                )}
              </div>

              {actionError && <p className="text-sm text-red-500 dark:text-red-400">{actionError}</p>}

              {can.archive && (
                <div className="pt-2 border-t border-warm-200 dark:border-disc-border flex justify-end">
                  <button onClick={archive} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover font-medium">
                    <Trash2 size={14} /> {t('modal.archive')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
