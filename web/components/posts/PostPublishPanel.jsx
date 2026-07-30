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
  const [groups, setGroups] = useState([])
  const [newsReady, setNewsReady] = useState(false)
  const [group, setGroup] = useState('')
  const [watermarks, setWatermarks] = useState([])
  const [wmType, setWmType] = useState('none')
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
    fetch('/api/posts/publish-targets')
      .then(res => (res.ok ? res.json() : {}))
      .then(data => {
        if (!alive) return
        const list = Array.isArray(data.groups) ? data.groups : []
        setGroups(list)
        setNewsReady(!!data.news)
        if (list.length === 1) setGroup(list[0].name)   // มีกลุ่มเดียวก็ไม่ต้องให้เลือก
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // poll เฉพาะตอนมีงานค้าง — โหลดเสร็จ jobs เปลี่ยน effect ก็ตั้งรอบใหม่เอง · ไม่มีงานค้าง = หยุดสนิท
  useEffect(() => {
    if (!jobs.some(j => BUSY.includes(j.status))) return
    const t = setTimeout(loadJobs, 10000)
    return () => clearTimeout(t)
  }, [jobs, loadJobs])

  const current = groups.find(g => g.name === group) || null

  // ลายน้ำผูกกับกลุ่ม (โฟลเดอร์คนละชุด) → เปลี่ยนกลุ่มต้องโหลดใหม่ + รีเซ็ตค่าที่ค้าง
  useEffect(() => {
    if (!group) { setWatermarks([]); setWmType('none'); return }
    let alive = true
    fetch(`/api/posts/watermarks?group=${encodeURIComponent(group)}`)
      .then(res => (res.ok ? res.json() : {}))
      .then(data => {
        if (!alive) return
        setWatermarks(Array.isArray(data.options) ? data.options : [])
        setWmType(data.default || 'none')          // ใช้ default ของกลุ่มเหมือนตะกร้าดิสฯ
      })
      .catch(() => {})
    return () => { alive = false }
  }, [group])

  // แพลตฟอร์มที่ติ๊กได้ = บัญชีที่กลุ่มนี้มีจริง (เหมือนตะกร้าดิสฯ ที่กรอง platform ตามกลุ่ม)
  // 'news' ไม่ใช่บัญชีโซเชียล — เป็นห้องใน Discord จึงขึ้นกับว่า guild ตั้งห้องข่าวไว้ไหม
  function blockedReason(key) {
    if (key === 'news') return newsReady ? null : 'เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งห้องข่าวสาร'
    if (!current) return 'เลือกกลุ่มก่อน'
    if (!current.platforms.includes(key)) return `กลุ่มนี้ไม่มีบัญชี ${platformLabel(key)}`
    if (NEEDS_MEDIA.includes(key) && !hasMedia) return 'ต้องมีสื่ออย่างน้อย 1 ชิ้น'
    return null
  }

  // เปลี่ยนกลุ่มแล้วแพลตฟอร์มที่ติ๊กค้างอาจไม่มีในกลุ่มใหม่ → ถอดออก (ไม่งั้น API ตอบ 403)
  useEffect(() => {
    if (!current) return
    setSelected(prev => {
      const kept = prev.filter(p => p === 'news' || current.platforms.includes(p))
      return kept.length === prev.length ? prev : kept        // ไม่มีอะไรถูกถอด = คืน array เดิม กัน re-render เปล่า
    })
  }, [current])

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
          group: group || null,
          wmType: hasMedia ? wmType : 'none',
          scheduledAt: scheduledAt || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'สั่งเผยแพร่ไม่สำเร็จ'); return }
      setSelected([])
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

      <div className="flex flex-col gap-1">
        <span className="text-sm text-warm-700 dark:text-disc-text">โพสต์ในนาม</span>
        <select
          value={group}
          onChange={e => { setError(''); setGroup(e.target.value) }}
          disabled={!groups.length}
          className="w-full h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal disabled:opacity-50"
        >
          <option value="">— เลือกกลุ่ม —</option>
          {groups.map(g => (
            <option key={g.name} value={g.name}>
              {g.name}{g.visibility === 'private' ? ' 🔒' : ''}
            </option>
          ))}
        </select>
        {!groups.length && (
          <span className="text-sm text-warm-500 dark:text-disc-muted">ยังไม่มีบัญชีโซเชียลที่ใช้ได้ — เชื่อมบัญชีที่ /bot/platforms ก่อน</span>
        )}
        {current && (
          <span className="text-sm text-warm-500 dark:text-disc-muted">
            {Object.entries(current.accounts).map(([p, name]) => `${platformLabel(p)}: ${name}`).join(' · ')}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {PLATFORMS.map(p => {
          const blocked = blockedReason(p.key)
          return (
            <label
              key={p.key}
              className={`flex items-center gap-2 text-sm ${blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(p.key)}
                disabled={!!blocked}
                onChange={() => togglePlatform(p.key)}
                className="w-4 h-4 accent-orange disabled:cursor-not-allowed"
              />
              <span className="text-warm-900 dark:text-disc-text">{p.label}</span>
              {blocked && <span className="text-sm text-warm-500 dark:text-disc-muted">— {blocked}</span>}
            </label>
          )
        })}
      </div>

      {hasMedia && watermarks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-warm-700 dark:text-disc-text">ลายน้ำ</span>
          <select
            value={wmType}
            onChange={e => setWmType(e.target.value)}
            className="w-full h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="none">ไม่มีลายน้ำ</option>
            {watermarks.map(w => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
        </div>
      )}

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
        disabled={submitting || !selected.length || (selected.some(p => p !== 'news') && !group)}
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
                  <span className="text-sm text-warm-900 dark:text-disc-text">
                    {platformLabel(job.platform)}
                    {job.group_name && (
                      <span className="text-warm-500 dark:text-disc-muted"> · {job.group_name}</span>
                    )}
                  </span>
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
