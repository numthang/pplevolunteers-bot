'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_LABELS } from '@/lib/caseOptionsClient.js'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500'
const btnCls = 'px-4 py-2 rounded-lg text-base font-semibold transition disabled:opacity-50'

const NEEDS_REASON = ['closed', 'rejected']
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed', 'rejected']

export default function CaseManageActions({ refId, status, isAssigned, closeReasons }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  // note
  const [note, setNote] = useState('')
  const [notePublic, setNotePublic] = useState(false)

  // status
  const [newStatus, setNewStatus] = useState(status)
  const [closeReason, setCloseReason] = useState(closeReasons[0])
  const [publicNote, setPublicNote] = useState('')

  async function call(url, body) {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'ไม่สำเร็จ') }
      router.refresh()
      return true
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); return false }
    finally { setBusy(false) }
  }

  async function takeCase() { await call(`/api/case/${refId}/assign`) }

  async function addNote() {
    if (!note.trim()) { alert('กรุณาใส่ข้อความ'); return }
    if (await call(`/api/case/${refId}/note`, { body: note, is_public: notePublic })) {
      setNote(''); setNotePublic(false)
    }
  }

  async function changeStatus() {
    const needsReason = NEEDS_REASON.includes(newStatus)
    if (needsReason && !publicNote.trim()) { alert('กรุณาเขียนข้อความแจ้งผู้ร้องเรียน'); return }
    const ok = await call(`/api/case/${refId}/status`, {
      status: newStatus,
      close_reason: needsReason ? closeReason : undefined,
      public_note: needsReason ? publicNote : undefined,
    })
    if (ok) setPublicNote('')
  }

  const needsReason = NEEDS_REASON.includes(newStatus)

  return (
    <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5 space-y-5">
      {/* รับเรื่อง */}
      {!isAssigned && (
        <button onClick={takeCase} disabled={busy} className={`${btnCls} w-full bg-orange text-white hover:bg-orange-light`}>
          รับเรื่องนี้
        </button>
      )}

      {/* เพิ่มบันทึก */}
      <div>
        <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-disc-text">เพิ่มบันทึก</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows="3" className={inputCls}
          placeholder="บันทึกความคืบหน้า..." style={{ resize: 'none' }} />
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 dark:text-disc-muted">
            <input type="checkbox" checked={notePublic} onChange={e => setNotePublic(e.target.checked)} className="w-4 h-4 accent-orange" />
            แสดงต่อผู้ร้องเรียน (สาธารณะ)
          </label>
          <button onClick={addNote} disabled={busy} className={`${btnCls} bg-indigo-600 text-white hover:bg-indigo-700`}>บันทึก</button>
        </div>
      </div>

      {/* เปลี่ยนสถานะ */}
      <div className="pt-4 border-t border-gray-100 dark:border-disc-border">
        <label className="block text-base font-semibold mb-1.5 text-gray-700 dark:text-disc-text">เปลี่ยนสถานะ</label>
        <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className={inputCls}>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>

        {needsReason && (
          <div className="mt-3 space-y-3">
            <select value={closeReason} onChange={e => setCloseReason(e.target.value)} className={inputCls}>
              {closeReasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <textarea value={publicNote} onChange={e => setPublicNote(e.target.value)} rows="2" className={inputCls}
              placeholder="ข้อความแจ้งผู้ร้องเรียน (จำเป็น) — จะแสดงในหน้าติดตามสาธารณะ" style={{ resize: 'none' }} />
          </div>
        )}

        <button onClick={changeStatus} disabled={busy || newStatus === status && !needsReason}
          className={`${btnCls} w-full mt-3 bg-indigo-600 text-white hover:bg-indigo-700`}>
          อัปเดตสถานะ
        </button>
      </div>
    </div>
  )
}
