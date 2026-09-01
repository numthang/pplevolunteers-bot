'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { STATUS_LABELS } from '@/lib/caseOptionsClient.js'
import useAutoGrow from '@/lib/useAutoGrow.js'
import CaseSaveBadge from '@/components/case/CaseSaveBadge.jsx'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const btnCls = 'px-4 py-2 rounded-lg text-base font-semibold transition disabled:opacity-50'

const NEEDS_REASON = ['closed', 'rejected']
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed', 'rejected']

/**
 * การ์ดจัดการเคส — รับเรื่อง · เปลี่ยนสถานะ
 * ⛔ ปุ่มลบ/เอาออกจากกรุ **ย้ายไปอยู่ท้ายการ์ดเนื้อหา** แล้ว (CaseDeleteButton — วางแบบเดียวกับ /posts/[id])
 *    อย่าเอากลับมาปนกับปุ่มทำงานประจำวันตรงนี้
 * ⛔ ปุ่ม "ร่างหนังสือร้องเรียน" ก็ย้ายไปรวมกับ AI dropdown ที่ CaseAiActions แล้ว (2026-09-01)
 */
export default function CaseManageActions({ refId, status, isAssigned, closeReasons }) {
  const t = useTranslations('case')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // status
  const [newStatus, setNewStatus] = useState(status)
  const [closeReason, setCloseReason] = useState(closeReasons[0])
  const [publicNote, setPublicNote] = useState('')
  const [statusSaveState, setStatusSaveState] = useState('idle')   // idle | saving | saved
  const [statusError, setStatusError] = useState('')
  const noteRef = useAutoGrow(publicNote)

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
   * ⚠️ ยกเว้น closed/rejected: server บังคับ close_reason + public_note (status/route.js:21)
   *    และ public_note กลายเป็น **timeline สาธารณะ** ที่ผู้ร้องเรียนเห็น → autosave ตอนพิมพ์
   *    = โพสต์สาธารณะงอกทีละท่อนทุก 800ms · เคสนี้จึงยังต้องกดยืนยัน 1 ครั้ง
   */
  async function saveStatus(next) {
    const needsReason = NEEDS_REASON.includes(next)
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
          public_note: needsReason ? publicNote : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatusSaveState('idle')
        setStatusError(d.error || t('actions.genericFailMsg'))
        setNewStatus(status)   // เซฟไม่ผ่าน = ช่องต้องกลับไปตรงกับของจริงใน DB
        return
      }
      if (needsReason) setPublicNote('')
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
    // ปิด/ไม่รับเรื่อง → รอเหตุผล + ข้อความถึงผู้ร้องเรียนก่อน · ที่เหลือบันทึกเลย
    if (!NEEDS_REASON.includes(next) && next !== status) saveStatus(next)
  }

  const needsReason = NEEDS_REASON.includes(newStatus)

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
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        {/* ปิด/ไม่รับเรื่องเท่านั้นที่ยังมีปุ่ม — เพราะข้อความนี้ถูกส่งออกให้ผู้ร้องเรียนเห็น
            ต้องเขียนจบก่อนแล้วค่อยกด ไม่ใช่ autosave ทีละท่อนระหว่างพิมพ์ */}
        {needsReason && (
          <div className="mt-3 space-y-3">
            <select value={closeReason} onChange={e => setCloseReason(e.target.value)} className={inputCls}>
              {closeReasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <textarea
              ref={noteRef}
              value={publicNote}
              onChange={e => setPublicNote(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none overflow-hidden min-h-[72px]`}
              placeholder={t('actions.publicNotePlaceholder')}
            />
            <button onClick={() => saveStatus(newStatus)} disabled={busy || !publicNote.trim()}
              className={`${btnCls} w-full bg-brand-orange text-white hover:bg-brand-orange-light`}>
              {STATUS_LABELS[newStatus]}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
