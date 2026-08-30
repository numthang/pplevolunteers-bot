'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

// เกินความยาวนี้ → ย่อไว้ก่อน กดขยายดูทีหลัง (กันสรุป AI ยาวๆ ดันรายการอื่นตกจอ)
// 400 = ให้สรุปที่มี "เหตุ → ดำเนินการ → ผลลัพธ์" ครบจบในบรรทัดเดียวโดยไม่ต้องกดขยาย
const LONG_BODY_LENGTH = 400

export default function CaseTimeline({ refId, initialEntries, hasThread }) {
  const t = useTranslations('case')
  const [entries, setEntries] = useState(initialEntries)
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)
  const [filesMsg, setFilesMsg] = useState('')
  const [syncMsg, setSyncMsg] = useState('')
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const router = useRouter()

  function toggleExpanded(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function addEntry(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true); setError(null)
    const res = await fetch(`/api/case/${refId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim(), is_public: isPublic }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(d.error || t('timeline.saveFailedMsg')); return }
    setEntries(d.entries)
    setBody('')
  }

  async function toggle(entry) {
    const res = await fetch(`/api/case/${refId}/timeline/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: !entry.is_public }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) setEntries(d.entries)
  }

  async function remove(id) {
    if (!confirm(t('timeline.deleteConfirm'))) return
    setDeletingId(id)
    const res = await fetch(`/api/case/${refId}/timeline/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    setDeletingId(null)
    if (res.ok) setEntries(d.entries)
  }

  async function refresh() {
    setRefreshing(true); setError(null); setFilesMsg(''); setSyncMsg('')
    const res = await fetch(`/api/case/${refId}/timeline/refresh`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setRefreshing(false)
    if (!res.ok) { setError(d.error || t('timeline.refreshFailedMsg')); return }
    setEntries(d.entries)
    // ต้องบอกผลเสมอ — เดิมกดแล้วเงียบสนิทเมื่อไม่มีข้อความใหม่ ผู้ใช้แยกไม่ออกว่า
    // "ไม่มีอะไรใหม่" กับ "ปุ่มพัง" ต่างกันยังไง
    if (d.partial) setSyncMsg(d.partialReason || t('timeline.syncPartial'))
    else if (d.added > 0) setSyncMsg(t('timeline.syncAdded', { count: d.added }))
    else setSyncMsg(t('timeline.syncNoNew'))
    // ไฟล์แนบ render ฝั่ง server (การ์ดผู้ร้องเรียน) → ต้อง refresh route ถึงจะโผล่
    if (d.files?.imported > 0) {
      setFilesMsg(t('timeline.filesImported', { count: d.files.imported }))
      router.refresh()
    }
  }

  return (
    <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5 mt-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted">Timeline</h2>
        {hasThread && (
          <button onClick={refresh} disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-disc-border text-gray-500 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-disc-hover disabled:opacity-50 transition">
            {refreshing ? t('timeline.refreshingButton') : t('timeline.refreshButton')}
          </button>
        )}
      </div>

      {syncMsg && <p className="text-sm text-gray-500 dark:text-disc-muted mb-3">{syncMsg}</p>}
      {filesMsg && <p className="text-sm text-orange mb-3">{filesMsg}</p>}

      {entries.length === 0 ? (
        <p className="text-base text-gray-400 dark:text-disc-muted mb-4">{t('timeline.emptyState')}</p>
      ) : (
        <ol className="space-y-3 mb-5">
          {entries.map(e => (
            <li key={e.id} className="relative pl-4 border-l-2 border-orange/30">
              <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-orange/60" />
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-sm text-gray-400 dark:text-disc-muted">{fmtDate(e.occurred_at)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded cursor-pointer select-none transition ${
                  e.is_public
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
                    : 'bg-gray-100 text-gray-500 dark:bg-disc-hover dark:text-disc-muted hover:bg-gray-200 dark:hover:bg-disc-border'
                }`} onClick={() => toggle(e)} title={t('timeline.toggleVisibilityTitle')}>
                  {e.is_public ? t('timeline.publicLabel') : t('timeline.internalLabel')}
                </span>
                {e.source === 'ai' && (
                  <span className="text-xs text-gray-300 dark:text-disc-muted/60">AI</span>
                )}
                <button onClick={() => remove(e.id)} disabled={deletingId === e.id}
                  className="ml-auto text-xs text-gray-300 dark:text-disc-muted/50 hover:text-red-400 dark:hover:text-red-400 disabled:opacity-50 transition">
                  {t('timeline.deleteButton')}
                </button>
              </div>
              {(() => {
                const isLong = e.body.length > LONG_BODY_LENGTH
                const expanded = expandedIds.has(e.id)
                const shown = isLong && !expanded ? e.body.slice(0, LONG_BODY_LENGTH).trimEnd() + '…' : e.body
                return (
                  <>
                    <p className="text-base text-gray-900 dark:text-disc-text whitespace-pre-wrap">{shown}</p>
                    {isLong && (
                      <button onClick={() => toggleExpanded(e.id)}
                        className="text-sm text-orange hover:underline mt-0.5">
                        {expanded ? t('timeline.showLessButton') : t('timeline.showMoreButton')}
                      </button>
                    )}
                  </>
                )
              })()}
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={addEntry} className="border-t border-gray-100 dark:border-disc-border pt-4 space-y-2">
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          placeholder={t('timeline.addPlaceholder')}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-disc-border bg-white dark:bg-disc-hover text-base text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange resize-none"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-disc-muted cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)}
              className="accent-orange" />
            {t('timeline.publishToggleLabel')}
          </label>
          <button type="submit" disabled={saving || !body.trim()}
            className="ml-auto px-4 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-light disabled:opacity-50 transition">
            {saving ? t('common.saving') : t('timeline.addButton')}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      </form>
    </div>
  )
}
