'use client'

// ประวัติการแก้ของโพสต์ — ตาข่ายรับเวลาเนื้อหาหาย (bug-071: autosave เคยทับโพสต์ให้ว่างเปล่า
// แล้วไม่มีทางดูย้อนหลังเลย ทั้งที่ post_revisions เก็บไว้ครบและ API ก็มีอยู่แล้ว)
import { useCallback, useEffect, useState } from 'react'
import { History, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'

function fmt(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function PostRevisions({ id, canEdit = false, onRestore, refreshKey = 0 }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null) // ดูเนื้อหาเต็มของฉบับไหนอยู่ (กางได้ทีละฉบับ)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}/revisions`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'โหลดประวัติไม่สำเร็จ'); return }
      setError('')
      setRows(Array.isArray(data.data) ? data.data : [])
    } catch {
      setError('โหลดประวัติไม่สำเร็จ')
    }
  }, [id])

  // โหลดตอนกางครั้งแรก + ทุกครั้งที่โพสต์ถูกเซฟ (refreshKey ขยับ)
  useEffect(() => { if (open) load() }, [open, load, refreshKey])

  return (
    <div className="pt-3 border-t border-warm-200 dark:border-disc-border">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-sm text-warm-700 dark:text-disc-text hover:text-teal transition"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <History size={14} />
        ประวัติการแก้{rows.length ? ` (${rows.length})` : ''}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!error && rows.length === 0 && (
            <p className="text-sm text-warm-500 dark:text-disc-muted">ยังไม่มีฉบับเก่าเก็บไว้</p>
          )}
          {rows.map(r => {
            const expanded = expandedId === r.id
            return (
              <div key={r.id} className="rounded-lg border border-warm-200 dark:border-disc-border p-2 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-warm-700 dark:text-disc-text">
                    {fmt(r.created_at)}
                    {(r.editor_name || r.edited_by_name) && (
                      <span className="text-warm-500 dark:text-disc-muted"> · {r.editor_name || r.edited_by_name}</span>
                    )}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => onRestore?.(r)}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                    >
                      <RotateCcw size={13} /> กู้คืน
                    </button>
                  )}
                </div>
                {expanded ? (
                  <>
                    {r.title && <p className="text-sm font-medium text-warm-700 dark:text-disc-text break-words">{r.title}</p>}
                    <p className="text-sm text-warm-500 dark:text-disc-muted whitespace-pre-wrap break-words">
                      {r.body || '(ไม่มีเนื้อหา)'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-warm-500 dark:text-disc-muted line-clamp-2 break-words">
                    {r.title ? `${r.title} — ` : ''}{(r.body || '').replace(/\s+/g, ' ').trim() || '(ไม่มีเนื้อหา)'}
                  </p>
                )}
                <button
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="self-start inline-flex items-center gap-1 text-sm text-warm-400 dark:text-disc-muted underline underline-offset-4 hover:text-teal transition"
                >
                  {(r.body || '').length} ตัวอักษร
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
