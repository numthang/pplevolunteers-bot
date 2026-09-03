'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { STATUS_LABELS, SELECTABLE_STATUSES, NEEDS_PUBLIC_NOTE, NEEDS_REJECT_REASON } from '@/lib/caseOptionsClient.js'
import useAutoGrow from '@/lib/useAutoGrow.js'
import CaseSaveBadge from '@/components/case/CaseSaveBadge.jsx'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const btnCls = 'px-4 py-2 rounded-lg text-base font-semibold transition disabled:opacity-50'

/**
 * การ์ดจัดการเคส — รับเรื่อง · เปลี่ยนสถานะ
 * ⛔ ปุ่มลบ/เอาออกจากกรุ **ย้ายไปอยู่ท้ายการ์ดเนื้อหา** แล้ว (CaseDeleteButton — วางแบบเดียวกับ /posts/[id])
 *    อย่าเอากลับมาปนกับปุ่มทำงานประจำวันตรงนี้
 * ⛔ ปุ่ม "ร่างหนังสือร้องเรียน" ก็ย้ายไปรวมกับ AI dropdown ที่ CaseAiActions แล้ว (2026-09-01)
 *
 * @param {string}      status         สถานะจริงใน DB ตอนนี้
 * @param {string|null} currentReason  `cases.close_reason` จริงใน DB — **ต้องส่งมาเสมอ**
 *   ⭐ เดิมช่องเหตุผลตั้งต้นเป็น `reasons[0]` ("แก้ไขสำเร็จ") ทุกครั้งที่เปิดหน้า ไม่เคยผูกกับของจริง
 *      → เคสที่ปิดไปแล้วด้วยเหตุผลอื่นกลับมาโชว์เหตุผลผิด (user เจอเอง 2026-09-04: เคสเป็น
 *        "ไม่รับดำเนินการ · ข้อมูลไม่พอ" แต่ฟอร์มโชว์ "แก้ไขสำเร็จ") · ห้ามกลับไปใช้ reasons[0] เฉยๆ อีก
 */
export default function CaseManageActions({ refId, status, isAssigned, rejectReasons, currentReason = null }) {
  const t = useTranslations('case')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // status
  const [newStatus, setNewStatus] = useState(status)
  const [closeReason, setCloseReason] = useState(
    rejectReasons.includes(currentReason) ? currentReason : rejectReasons[0],
  )
  const [publicNote, setPublicNote] = useState('')
  const [statusSaveState, setStatusSaveState] = useState('idle')   // idle | saving | saved
  const [statusError, setStatusError] = useState('')
  const noteRef = useAutoGrow(publicNote)   // ref ตัวนี้ชี้ที่ <textarea> ตรงๆ → ใช้ focus() ได้เลย

  async function call(url, body, method = 'POST') {
    setBusy(true)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || t('actions.genericFailMsg')) }
      router.refresh()
      return true
    } catch (e) { alert(t('actions.errorAlert', { message: e.message })); return false }
    finally { setBusy(false) }
  }

  async function takeCase() { await call(`/api/case/${refId}/assign`) }
  async function leaveCase() { await call(`/api/case/${refId}/assign`, {}, 'DELETE') }

  /**
   * เปลี่ยนสถานะแล้วบันทึกทันที — ไม่มีปุ่ม "อัปเดตสถานะ" อีกแล้ว (user 2026-08-31)
   *
   * ⚠️ ยกเว้นสถานะจบเคส (resolved/rejected): server บังคับ public_note (+ close_reason ถ้า rejected)
   *    และ public_note กลายเป็น **timeline สาธารณะ** ที่ผู้ร้องเรียนเห็น → autosave ตอนพิมพ์
   *    = โพสต์สาธารณะงอกทีละท่อนทุก 800ms · เคสนี้จึงยังต้องกดยืนยัน 1 ครั้ง
   */
  async function saveStatus(next) {
    const needsReason = NEEDS_REJECT_REASON.includes(next)
    setStatusError('')
    setStatusSaveState('saving')
    setBusy(true)
    try {
      const res = await fetch(`/api/case/${refId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: next,
          close_reason: needsReason ? closeReason : undefined,
          public_note: NEEDS_PUBLIC_NOTE.includes(next) ? publicNote : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatusSaveState('idle')
        setStatusError(d.error || t('actions.genericFailMsg'))
        setNewStatus(status)   // เซฟไม่ผ่าน = ช่องต้องกลับไปตรงกับของจริงใน DB
        return
      }
      if (NEEDS_PUBLIC_NOTE.includes(next)) setPublicNote('')
      setStatusSaveState('saved')
      setTimeout(() => setStatusSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
      router.refresh()
    } catch (e) {
      setStatusSaveState('idle')
      setStatusError(e.message || t('actions.genericFailMsg'))
      setNewStatus(status)
    } finally {
      setBusy(false)
    }
  }

  function pickStatus(next) {
    setNewStatus(next)
    setStatusError('')
    // จบเคส → รอข้อความถึงผู้ร้องเรียนก่อน (+ เหตุผลถ้าไม่รับ) · ที่เหลือบันทึกเลย
    if (!NEEDS_PUBLIC_NOTE.includes(next) && next !== status) saveStatus(next)
  }

  /**
   * ⭐ ปุ่มยืนยัน **กดได้เสมอ** แล้วค่อยฟ้อง — ห้ามกลับไปใช้ `disabled` เงียบๆ อีก (2026-09-04)
   *    ของเดิม `disabled={busy || !publicNote.trim()}` ทำให้คนกดแล้วไม่มีอะไรเกิดขึ้น
   *    ไม่มีข้อความบอกว่าต้องพิมพ์อะไรก่อน · ยิ่งสถานะอื่นเลือกแล้วเซฟทันที คนใช้ยิ่งนึกว่าเลือกเสร็จแล้วจบ
   */
  function confirmStatus() {
    if (!publicNote.trim()) {
      setStatusError(t('actions.publicNoteRequired'))
      noteRef.current?.focus()
      return
    }
    saveStatus(newStatus)
  }

  const needsNote = NEEDS_PUBLIC_NOTE.includes(newStatus)
  const needsReason = NEEDS_REJECT_REASON.includes(newStatus)
  // เคสเก่าที่ยังเป็น `closed` (เลิกใช้แล้ว) ต้องมี option ของตัวเองใน select ไม่งั้น React จะโชว์
  // ตัวแรกของรายการแทน = เจ้าหน้าที่เห็นสถานะผิด แล้วเผลอเซฟทับเป็น "รับเรื่องแล้ว"
  const statusOptions = SELECTABLE_STATUSES.includes(status)
    ? SELECTABLE_STATUSES
    : [status, ...SELECTABLE_STATUSES]

  return (
    <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5 space-y-5">
      {/* รับเรื่อง / ถอนตัว */}
      {!isAssigned ? (
        <button onClick={takeCase} disabled={busy} className={`${btnCls} w-full bg-orange text-white hover:bg-orange-light`}>
          {t('actions.takeCaseButton')}
        </button>
      ) : (
        <button onClick={leaveCase} disabled={busy} className={`${btnCls} w-full border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text hover:border-red-400 hover:text-red-500`}>
          {t('actions.leaveCaseButton')}
        </button>
      )}

      {/* เปลี่ยนสถานะ — เลือกแล้วบันทึกทันที ไม่มีปุ่มอัปเดต */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label className="text-base font-semibold text-gray-700 dark:text-disc-text">{t('actions.changeStatusLabel')}</label>
          <CaseSaveBadge saveState={statusSaveState} error={statusError} />
        </div>
        <select value={newStatus} onChange={e => pickStatus(e.target.value)} disabled={busy} className={inputCls}>
          {statusOptions.map(s => (
            <option key={s} value={s} disabled={!SELECTABLE_STATUSES.includes(s)}>
              {STATUS_LABELS[s]}{SELECTABLE_STATUSES.includes(s) ? '' : ` — ${t('actions.retiredStatusSuffix')}`}
            </option>
          ))}
        </select>

        {/* สถานะจบเคสเท่านั้นที่ยังมีปุ่ม — เพราะข้อความนี้ถูกส่งออกให้ผู้ร้องเรียนเห็น
            ต้องเขียนจบก่อนแล้วค่อยกด ไม่ใช่ autosave ทีละท่อนระหว่างพิมพ์ */}
        {needsNote && (
          <div className="mt-3 space-y-3">
            {needsReason && (
              <select value={closeReason} onChange={e => setCloseReason(e.target.value)} className={inputCls}>
                {rejectReasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            <textarea
              ref={noteRef}
              value={publicNote}
              onChange={e => setPublicNote(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none overflow-hidden min-h-[72px]`}
              placeholder={t('actions.publicNotePlaceholder')}
            />
            <button onClick={confirmStatus} disabled={busy}
              className={`${btnCls} w-full bg-brand-orange text-white hover:bg-brand-orange-light`}>
              {STATUS_LABELS[newStatus]}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
