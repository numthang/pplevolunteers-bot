'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, RotateCcw, XCircle, ExternalLink } from 'lucide-react'

// ค่าเดียวกับ VALID_PLATFORMS ใน app/api/posts/[id]/publish/route.js
const PLATFORMS = [
  { key: 'fb', label: 'Facebook' },
  { key: 'ig', label: 'Instagram' },
  { key: 'threads', label: 'Threads' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'news', label: 'ห้องข่าวสาร' },
]

// IG/Threads โพสต์ข้อความล้วนไม่ได้ — API กันอีกชั้น (NEEDS_MEDIA ใน route)
const NEEDS_MEDIA = ['ig', 'threads']

const JOB_STATUS = {
  pending: { label: 'รอคิว', cls: 'text-warm-500 dark:text-disc-muted' },
  running: { label: 'กำลังยิง', cls: 'text-orange' },
  done: { label: 'สำเร็จ', cls: 'text-green-600' },
  failed: { label: 'ล้มเหลว', cls: 'text-red-500' },
  stale: { label: 'เลยเวลา', cls: 'text-amber-600' },
  canceled: { label: 'ยกเลิก', cls: 'text-warm-400 dark:text-disc-muted' },
}

const BUSY = ['pending', 'running']

function platformLabel(key) {
  return PLATFORMS.find(p => p.key === key)?.label || key
}

function fmtTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ค่า min ของ datetime-local ต้องเป็นเวลาเครื่อง (ไม่มี timezone) — คำนวณฝั่ง client เท่านั้น กัน hydration ไม่ตรง
function localNow() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
  return d.toISOString().slice(0, 16)
}

export default function PostPublishPanel({ postId, hasMedia = false }) {
  const [selected, setSelected] = useState([])
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [minTime, setMinTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState([])
  const [jobError, setJobError] = useState('')
  const [actingId, setActingId] = useState(null)

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/jobs`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return
      setJobs(data.data || [])
    } catch { /* งานโพสต์โหลดไม่ได้ ไม่ควรทำให้กล่องพัง — รอบหน้าค่อยว่า */ }
  }, [postId])

  useEffect(() => { setMinTime(localNow()) }, [])
  useEffect(() => { loadJobs() }, [loadJobs])

  useEffect(() => {
    let alive = true
    fetch('/api/social/accounts')
      .then(res => (res.ok ? res.json() : []))
      .then(rows => { if (alive) setAccounts(Array.isArray(rows) ? rows : []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // poll เฉพาะตอนมีงานค้าง — โหลดเสร็จ jobs เปลี่ยน effect ก็ตั้งรอบใหม่เอง · ไม่มีงานค้าง = หยุดสนิท
  useEffect(() => {
    if (!jobs.some(j => BUSY.includes(j.status))) return
    const t = setTimeout(loadJobs, 10000)
    return () => clearTimeout(t)
  }, [jobs, loadJobs])

  // API รับ accountId ตัวเดียว และต้องเป็นบัญชีของแพลตฟอร์มที่ติ๊กไว้ ไม่งั้น 400
  const accountOptions = accounts.filter(a => selected.includes(a.platform))
  // ติ๊กแพลตฟอร์มออกทีหลัง → บัญชีที่ค้างอยู่ในช่องจะไม่ตรงกับ platforms อีก (API ตอบ 400) → ล้างทิ้ง
  useEffect(() => {
    setAccountId(prev => (prev && !accounts.some(a => String(a.id) === prev && selected.includes(a.platform)) ? '' : prev))
  }, [accounts, selected])

  function togglePlatform(key) {
    setError('')
    setSelected(prev => (prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]))
  }

  async function handlePublish() {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: selected,
          accountId: accountId ? Number(accountId) : null,
          scheduledAt: scheduledAt || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'สั่งเผยแพร่ไม่สำเร็จ'); return }
      setSelected([])
      setAccountId('')
      setScheduledAt('')
      setJobs(prev => [...(data.data?.jobs || []), ...prev])
    } catch {
      setError('สั่งเผยแพร่ไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  async function jobAction(jobId, action) {
    setActingId(jobId)
    setJobError('')
    try {
      const res = await fetch(`/api/posts/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setJobError(data.error || 'ทำรายการไม่สำเร็จ'); return }
      await loadJobs()
    } catch {
      setJobError('ทำรายการไม่สำเร็จ')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="pt-3 border-t border-warm-200 dark:border-disc-border flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide">
        เผยแพร่
      </h2>

      <div className="flex flex-col gap-1.5">
        {PLATFORMS.map(p => {
          const blocked = NEEDS_MEDIA.includes(p.key) && !hasMedia
          return (
            <label
              key={p.key}
              className={`flex items-center gap-2 text-sm ${blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.key)}
                disabled={blocked}
                onChange={() => togglePlatform(p.key)}
                className="w-4 h-4 accent-orange disabled:cursor-not-allowed"
              />
              <span className="text-warm-900 dark:text-disc-text">{p.label}</span>
              {blocked && <span className="text-sm text-warm-500 dark:text-disc-muted">— ต้องมีสื่ออย่างน้อย 1 ชิ้น</span>}
            </label>
          )
        })}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-warm-700 dark:text-disc-text">บัญชี</span>
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          disabled={!accountOptions.length}
          className="w-full h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-50"
        >
          <option value="">ใช้บัญชีหลักอัตโนมัติ</option>
          {accountOptions.map(a => (
            <option key={a.id} value={a.id}>
              {platformLabel(a.platform)} — {a.name}{a.group_name ? ` (${a.group_name})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm text-warm-700 dark:text-disc-text">ตั้งเวลา</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          min={minTime || undefined}
          onChange={e => setScheduledAt(e.target.value)}
          className="w-full h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
        />
        <span className="text-sm text-warm-500 dark:text-disc-muted">ว่างไว้ = โพสต์ทันที</span>
      </div>

      <button
        onClick={handlePublish}
        disabled={submitting || !selected.length}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        เผยแพร่
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {jobs.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-warm-200 dark:border-disc-border">
          <h3 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide">
            งานโพสต์ ({jobs.length})
          </h3>
          {jobError && <p className="text-sm text-red-500">{jobError}</p>}
          {jobs.map(job => {
            const meta = JOB_STATUS[job.status] || { label: job.status, cls: 'text-warm-500 dark:text-disc-muted' }
            const url = job.result?.url
            return (
              <div
                key={job.id}
                className="rounded-lg border border-warm-200 dark:border-disc-border p-2 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-warm-900 dark:text-disc-text">{platformLabel(job.platform)}</span>
                  <span className={`text-sm ${meta.cls}`}>{meta.label}</span>
                </div>

                {job.scheduled_at && job.status === 'pending' && (
                  <span className="text-sm text-warm-500 dark:text-disc-muted">ตั้งเวลา {fmtTime(job.scheduled_at)}</span>
                )}
                {job.posted_at && (
                  <span className="text-sm text-warm-500 dark:text-disc-muted">โพสต์เมื่อ {fmtTime(job.posted_at)}</span>
                )}

                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-teal hover:underline break-all"
                  >
                    <ExternalLink size={13} /> ดูโพสต์
                  </a>
                )}

                {job.last_error && <p className="text-sm text-red-500 break-words">{job.last_error}</p>}

                {(job.status === 'failed' || job.status === 'stale') && (
                  <button
                    onClick={() => jobAction(job.id, 'retry')}
                    disabled={actingId === job.id}
                    className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 disabled:opacity-40 transition"
                  >
                    {actingId === job.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                    ลองใหม่
                  </button>
                )}

                {job.status === 'pending' && (
                  <button
                    onClick={() => jobAction(job.id, 'cancel')}
                    disabled={actingId === job.id}
                    className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 disabled:opacity-40 transition"
                  >
                    {actingId === job.id ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    ยกเลิก
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
