'use client'

import { useState } from 'react'

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function CaseTimeline({ refId, initialEntries, hasThread }) {
  const [entries, setEntries] = useState(initialEntries)
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState(null)

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
    if (!res.ok) { setError(d.error || 'บันทึกไม่สำเร็จ'); return }
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
    if (!confirm('ลบรายการนี้?')) return
    setDeletingId(id)
    const res = await fetch(`/api/case/${refId}/timeline/${id}`, { method: 'DELETE' })
    const d = await res.json().catch(() => ({}))
    setDeletingId(null)
    if (res.ok) setEntries(d.entries)
  }

  async function refresh() {
    setRefreshing(true); setError(null)
    const res = await fetch(`/api/case/${refId}/timeline/refresh`, { method: 'POST' })
    const d = await res.json().catch(() => ({}))
    setRefreshing(false)
    if (!res.ok) { setError(d.error || 'refresh ไม่สำเร็จ'); return }
    setEntries(d.entries)
  }

  return (
    <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5 mt-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted">Timeline</h2>
        {hasThread && (
          <button onClick={refresh} disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-disc-border text-gray-500 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-disc-hover disabled:opacity-50 transition">
            {refreshing ? 'กำลัง refresh...' : '↻ ดึง Discord ใหม่'}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-base text-gray-400 dark:text-disc-muted mb-4">ยังไม่มี timeline</p>
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
                }`} onClick={() => toggle(e)} title="คลิกเพื่อสลับ สาธารณะ/ภายใน">
                  {e.is_public ? 'สาธารณะ' : 'ภายใน'}
                </span>
                {e.source === 'ai' && (
                  <span className="text-xs text-gray-300 dark:text-disc-muted/60">AI</span>
                )}
                <button onClick={() => remove(e.id)} disabled={deletingId === e.id}
                  className="ml-auto text-xs text-gray-300 dark:text-disc-muted/50 hover:text-red-400 dark:hover:text-red-400 disabled:opacity-50 transition">
                  ลบ
                </button>
              </div>
              <p className="text-base text-gray-900 dark:text-disc-text whitespace-pre-wrap">{e.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={addEntry} className="border-t border-gray-100 dark:border-disc-border pt-4 space-y-2">
        <textarea
          value={body} onChange={e => setBody(e.target.value)}
          placeholder="เพิ่ม timeline entry..."
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-disc-border bg-white dark:bg-disc-hover text-base text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange resize-none"
        />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-disc-muted cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)}
              className="accent-orange" />
            เผยแพร่ให้ประชาชนเห็น
          </label>
          <button type="submit" disabled={saving || !body.trim()}
            className="ml-auto px-4 py-1.5 rounded-lg bg-brand-orange text-white text-sm font-semibold hover:bg-brand-orange-light disabled:opacity-50 transition">
            {saving ? 'กำลังบันทึก...' : 'เพิ่ม'}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
      </form>
    </div>
  )
}
