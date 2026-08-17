'use client'

/**
 * OwnerPicker — ดู/เปลี่ยน/ถอด "เจ้าภาพ" ของการ์ด 1 ใบ
 *
 * ดีไซน์ (§คำศัพท์ — เจ้าภาพมีได้ 1 คนเท่านั้น):
 *   - ปกติเห็นแค่ชื่อ + ปุ่ม — คนส่วนใหญ่เปิดการ์ดมาดู ไม่ได้มามอบหมาย
 *   - เลือกคนด้วย **ช่องค้นหา ไม่ใช่ dropdown** — org นี้มีสมาชิก 7 พันคน (ดู /api/kanban/people)
 *   - ถอดเจ้าภาพ = การ์ดกลับไปช่อง "รอรับ" อัตโนมัติ (API จัดให้ — กติกา "ไม่มีเจ้าภาพอยู่ได้แค่ backlog")
 *     → ต้องบอกผู้ใช้ก่อนกด ไม่ใช่ให้สถานะเปลี่ยนเงียบๆ
 *
 * ⚠️ ไม่ผ่าน lockToken — เป็น action ปุ่มเดียว เหมือน statusType/labels/helpers
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { UserCog, Search, X, Loader2 } from 'lucide-react'

const SEARCH_DEBOUNCE_MS = 300

export default function OwnerPicker({ card, canEdit, canClaim, onPatch, onError }) {
  const t = useTranslations('kanban')

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  // ค้นหาแบบหน่วง — พิมพ์ทุกตัวอักษรแล้วยิงทันทีคือยิงรัวใส่ DB ฟรีๆ
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) { setPeople([]); setSearching(false); return }

    setSearching(true)
    const timer = setTimeout(async () => {
      const mine = ++seq.current
      try {
        const res = await fetch(`/api/kanban/people?q=${encodeURIComponent(term)}`)
        const json = await res.json().catch(() => ({}))
        if (mine !== seq.current) return          // คำตอบเก่ากว่าที่พิมพ์ล่าสุด ทิ้ง
        if (!res.ok) { onError?.(json.error || t('loadFailed')); return }
        setPeople(json.people || [])
      } catch {
        if (mine === seq.current) onError?.(t('loadFailed'))
      } finally {
        if (mine === seq.current) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [q, open, t, onError])

  async function assign(userId) {
    setBusy(true)
    await onPatch({ ownerUserId: userId })
    setBusy(false)
    setOpen(false)
    setQ('')
    setPeople([])
  }

  async function removeOwner() {
    // สถานะจะเปลี่ยนตามไปด้วย → ถามก่อน ไม่ใช่ทำเงียบๆ
    if (!window.confirm(t('modal.confirmRemoveOwner'))) return
    setBusy(true)
    await onPatch({ ownerUserId: null })
    setBusy(false)
    setOpen(false)
  }

  return (
    <div className="min-w-[14rem] flex-1">
      <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">{t('modal.ownerLabel')}</label>

      <div className="min-h-11 flex flex-wrap items-center gap-2">
        <span className={`text-base ${card.owner_name ? 'text-warm-900 dark:text-disc-text' : 'text-warm-400 dark:text-disc-muted'}`}>
          {card.owner_name || t('modal.noOwner')}
        </span>
        {busy && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}

        {canEdit && !open && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 px-4 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            <UserCog size={16} /> {card.owner_user_id ? t('modal.changeOwner') : t('modal.assignOwner')}
          </button>
        )}

        {/* ไม่มีเจ้าภาพ + ไม่มีสิทธิ์แก้การ์ด → ยังรับเองได้ (grill ข้อ 8 — อาสาเองได้ ไม่ต้องรอมอบหมาย) */}
        {!card.owner_user_id && canClaim && !canEdit && (
          <button
            onClick={async () => { setBusy(true); await onPatch({ claim: true }); setBusy(false) }}
            className="px-4 py-2 text-base rounded-lg bg-teal text-white font-medium hover:opacity-90 transition"
          >
            {t('actions.claim')}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-warm-200 dark:border-disc-border p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted" />
              <input
                type="text"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('modal.searchPeoplePlaceholder')}
                className="w-full h-11 pl-9 pr-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>
            <button
              onClick={() => { setOpen(false); setQ(''); setPeople([]) }}
              aria-label={t('form.cancelButton')}
              title={t('form.cancelButton')}
              className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
            >
              <X size={18} />
            </button>
          </div>

          {q.trim().length < 2 && (
            <p className="text-base text-warm-400 dark:text-disc-muted">{t('modal.searchPeopleHint')}</p>
          )}
          {searching && <p className="text-base text-warm-400 dark:text-disc-muted">{t('loading')}</p>}
          {!searching && q.trim().length >= 2 && people.length === 0 && (
            <p className="text-base text-warm-400 dark:text-disc-muted">{t('modal.noPeopleFound')}</p>
          )}

          <div className="flex flex-col max-h-56 overflow-y-auto">
            {people.map((p) => (
              <button
                key={p.userId}
                disabled={busy}
                onClick={() => assign(p.userId)}
                className={`text-left px-3 py-2 text-base rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50 ${
                  String(p.userId) === String(card.owner_user_id)
                    ? 'text-teal font-medium'
                    : 'text-warm-900 dark:text-disc-text'
                }`}
              >
                {p.name}
                {/* ชื่อที่ตั้งไว้ใน org ต่างจากชื่อหลัก → โชว์กำกับ ให้รู้ว่ากดถูกคน */}
                {p.orgName && (
                  <span className="ml-2 text-sm text-warm-400 dark:text-disc-muted">{p.orgName}</span>
                )}
              </button>
            ))}
          </div>

          {card.owner_user_id && (
            <div className="pt-2 border-t border-warm-200 dark:border-disc-border flex justify-end">
              <button
                onClick={removeOwner}
                disabled={busy}
                className="px-4 py-2 text-base rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-disc-hover font-medium transition disabled:opacity-50"
              >
                {t('modal.removeOwner')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
