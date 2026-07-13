'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { STATUS_LABELS } from '@/lib/caseOptionsClient.js'
import CaseLetterModal from '@/components/case/CaseLetterModal.jsx'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const btnCls = 'px-4 py-2 rounded-lg text-base font-semibold transition disabled:opacity-50'

const NEEDS_REASON = ['closed', 'rejected']
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed', 'rejected']

export default function CaseManageActions({ refId, status, isAssigned, closeReasons }) {
  const t = useTranslations('case')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showLetter, setShowLetter] = useState(false)

  // status
  const [newStatus, setNewStatus] = useState(status)
  const [closeReason, setCloseReason] = useState(closeReasons[0])
  const [publicNote, setPublicNote] = useState('')

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

  async function changeStatus() {
    const needsReason = NEEDS_REASON.includes(newStatus)
    if (needsReason && !publicNote.trim()) { alert(t('actions.publicNoteRequiredAlert')); return }
    const ok = await call(`/api/case/${refId}/status`, {
      status: newStatus,
      close_reason: needsReason ? closeReason : undefined,
      public_note: needsReason ? publicNote : undefined,
    })
    if (ok) setPublicNote('')
  }

  const needsReason = NEEDS_REASON.includes(newStatus)

  return (
    <>
    {showLetter && <CaseLetterModal refId={refId} onClose={() => setShowLetter(false)} />}
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

      {/* เปลี่ยนสถานะ */}
      <div>
        <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-disc-text">{t('actions.changeStatusLabel')}</label>
        <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputCls}>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        {needsReason && (
          <div className="mt-3 space-y-3">
            <select value={closeReason} onChange={e => setCloseReason(e.target.value)} className={inputCls}>
              {closeReasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <textarea value={publicNote} onChange={e => setPublicNote(e.target.value)} rows="2" className={inputCls}
              placeholder={t('actions.publicNotePlaceholder')} style={{ resize: 'none' }} />
          </div>
        )}

        <button onClick={changeStatus} disabled={busy || newStatus === status && !needsReason}
          className={`${btnCls} w-full mt-3 bg-brand-orange text-white hover:bg-brand-orange-light`}>
          {t('actions.updateStatusButton')}
        </button>
      </div>

      {/* ร่างหนังสือ */}
      <div>
        <button onClick={() => setShowLetter(true)} className={`${btnCls} w-full border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text hover:border-brand-orange hover:text-brand-orange`}>
          {t('actions.draftLetterButton')}
        </button>
      </div>
    </div>
    </>
  )
}
