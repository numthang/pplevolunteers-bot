'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2, ArchiveRestore } from 'lucide-react'
// ใช้กล่องเดียวกับ kanban/posts — ปุ่มเดียว แล้วเลือกในกล่องว่าเก็บเข้ากรุหรือลบถาวร
import DeleteChoiceDialog from '@/components/kanban/DeleteChoiceDialog.jsx'

/**
 * ปุ่มลบเคส — วางไว้ท้ายการ์ดเนื้อหา มุมขวาล่าง เหมือนปุ่ม "เก็บเข้ากรุ" ของ /posts/[id]
 * (ย้ายออกจาก CaseManageActions 2026-08-31 — ปุ่มทำลายไม่ควรอยู่ปนกับปุ่มทำงานประจำวัน)
 *
 * ⛔ ค่าตั้งต้นของปุ่มคือ "เก็บเข้ากรุ" เสมอ ห้ามผูกปุ่มเดียวกับลบถาวร
 *    (บทเรียนจาก kanban commit 37dd5e6: ปุ่มเขียนว่าเก็บเข้ากรุ แต่ทำงานเป็นลบถาวร = โกหกผู้ใช้)
 */
export default function CaseDeleteButton({ refId, title = '', archived = false, canPurge = false, counts = { timeline: 0, attachments: 0 } }) {
  const t = useTranslations('case')
  const router = useRouter()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function removeCase(permanent) {
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/case/${refId}${permanent ? '?purge=1' : ''}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || t('actions.genericFailMsg')); return }
      setShow(false)
      // ลบถาวรแล้วเคสไม่มีอยู่อีก → เด้งกลับ /case ไม่ใช่ refresh หน้าที่ 404 ไปแล้ว
      if (permanent) router.push('/case')
      else router.refresh()
    } catch (e) {
      setError(e.message || t('actions.genericFailMsg'))
    } finally {
      setBusy(false)
    }
  }

  async function restoreCase() {
    setBusy(true)
    try {
      const res = await fetch(`/api/case/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {show && (
        <DeleteChoiceDialog
          title={title || refId}
          heading={t('archive.heading')}
          impact={t('archive.impact', { timeline: counts.timeline, attachments: counts.attachments })}
          hideLabel={t('actions.archive')}
          hideHint={t('archive.hint')}
          canPurge={canPurge}
          busy={busy}
          error={error}
          onHide={() => removeCase(false)}
          onPurge={() => removeCase(true)}
          onClose={() => setShow(false)}
          t={t}
        />
      )}

      {archived ? (
        <button
          onClick={restoreCase}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:text-orange hover:bg-orange/10 disabled:opacity-50 transition"
        >
          <ArchiveRestore size={14} /> {busy ? t('actions.restoring') : t('actions.restoreCaseButton')}
        </button>
      ) : (
        <button
          onClick={() => setShow(true)}
          disabled={busy}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover disabled:opacity-50 transition"
        >
          <Trash2 size={14} /> {t('actions.deleteCaseButton')}
        </button>
      )}
    </>
  )
}
