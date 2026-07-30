'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Sparkles, Send, Undo2, ThumbsUp, X, Trash2 } from 'lucide-react'
import PostRevisions from './PostRevisions.jsx'

const STATUS_LABEL = { draft: 'ฉบับร่าง', review: 'รอตรวจ', approved: 'อนุมัติแล้ว' }

function autoGrow(el) {
  if (!el) return
  const scrollY = window.scrollY
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
  window.scrollTo({ top: scrollY, behavior: 'instant' })
}

// ─── กล่องถามตอนชน 409 — ปิดได้ 3 ทาง (X/ESC/คลิกนอกกล่อง) = เท่ากับ "โหลดใหม่" ───
function ConflictDialog({ onReload, onKeepAsRevision, keeping }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onReload() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onReload])

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onReload() }}
    >
      <div className="bg-card-bg rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">คนอื่นแก้โพสต์นี้ไปแล้ว</h2>
          <button onClick={onReload} className="text-warm-400 hover:opacity-70 text-2xl w-9 h-9 flex items-center justify-center rounded-lg">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-base text-warm-500 dark:text-disc-muted">
            มีคนแก้ฉบับที่เห็นอยู่นี้ไปแล้ว เลือกว่าจะทำยังไงกับฉบับที่คุณกำลังพิมพ์อยู่
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={onKeepAsRevision}
              disabled={keeping}
              className="px-4 py-3 bg-teal hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition"
            >
              {keeping ? 'กำลังเก็บ...' : 'เก็บฉบับของฉันเป็น revision แล้วโหลดใหม่'}
            </button>
            <button
              onClick={onReload}
              className="px-4 py-3 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 transition"
            >
              โหลดใหม่ (ทิ้งของฉัน)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PostEditor({ id }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [savedCount, setSavedCount] = useState(0)   // ขยับทุกครั้งที่เซฟ → ให้ประวัติโหลดใหม่
  const [loadError, setLoadError] = useState('')
  const [post, setPost] = useState(null)
  const [can, setCan] = useState({})
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [conflict, setConflict] = useState(false)
  const [keepingRevision, setKeepingRevision] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState('')

  const lockTokenRef = useRef(null)
  const loadedRef = useRef(false)      // เนื้อหาจริงเข้ากล่องแล้วหรือยัง — กัน autosave ยิงทับตอนยังว่าง
  const isFirstLoad = useRef(true)
  const blockedRef = useRef(false)
  const saveTimer = useRef(null)
  const bodyRef = useRef(null)

  async function load() {
    setLoading(true)
    setLoadError('')
    loadedRef.current = false
    try {
      const res = await fetch(`/api/posts/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(data.error || 'โหลดโพสต์ไม่สำเร็จ'); setLoading(false); return }
      isFirstLoad.current = true
      loadedRef.current = true
      setPost(data.data.post)
      setCan(data.data.can || {})
      setTitle(data.data.post.title || '')
      setBody(data.data.post.body || '')
      lockTokenRef.current = data.data.post.lock_token
    } catch {
      setLoadError('โหลดโพสต์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { autoGrow(bodyRef.current) }, [loading, body])

  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    if (blockedRef.current) return
    if (!loadedRef.current) return          // ยังโหลดไม่เสร็จ = ค่าที่เห็นยังเป็นค่าว่าง ห้ามเซฟทับ
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, 800)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body])

  async function save() {
    if (blockedRef.current) return
    if (!loadedRef.current || !lockTokenRef.current) return   // ด่านสุดท้ายก่อนยิง PATCH (ดู bug-071)
    setSaveState('saving')
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockToken: lockTokenRef.current, title, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.conflict) {
        blockedRef.current = true
        setConflict(true)
        setSaveState('idle')
        return
      }
      if (!res.ok) { setSaveState('idle'); return }
      lockTokenRef.current = data.data.post.lock_token
      setPost(data.data.post)
      setSavedCount(c => c + 1)
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
      window.dispatchEvent(new CustomEvent('posts:changed', { detail: { id } }))
    } catch {
      setSaveState('idle')
    }
  }

  function handleReload() {
    blockedRef.current = false
    setConflict(false)
    load()
  }

  async function handleKeepAsRevision() {
    setKeepingRevision(true)
    try {
      await fetch(`/api/posts/${id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
    } catch { /* ไม่ให้ error ตรงนี้บล็อกการโหลดใหม่ */ }
    setKeepingRevision(false)
    handleReload()
  }

  // กู้คืนฉบับเก่า — เก็บฉบับปัจจุบันเป็น revision ก่อน แล้วค่อยใส่ของเก่าลงกล่อง (autosave เซฟต่อเอง)
  async function handleRestoreRevision(rev) {
    if (!confirm('กู้คืนฉบับนี้ทับเนื้อหาปัจจุบัน? (ฉบับปัจจุบันจะถูกเก็บไว้ในประวัติ)')) return
    try {
      await fetch(`/api/posts/${id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
    } catch { /* เก็บไม่ได้ก็ยังกู้คืนต่อได้ — ของเก่ายังอยู่ใน revision อยู่ดี */ }
    setTitle(rev.title || '')
    setBody(rev.body || '')
  }

  async function handleDeletePost() {
    if (!confirm('เก็บโพสต์นี้เข้ากรุ? (กู้คืนได้ที่แถบ "ในกรุ" ในหน้ารายการ)')) return
    try {
      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' })
      if (res.ok) router.push('/posts')
    } catch { /* ลบไม่สำเร็จ = อยู่หน้าเดิม ผู้ใช้กดใหม่ได้ */ }
  }

  async function handleAiDraft() {
    if (body.trim() && !confirm('มีเนื้อหาอยู่แล้ว — ให้ AI เขียนทับเนื้อหาเดิมเลยไหม?')) return
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/posts/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAiError(data.error || 'ร่างด้วย AI ไม่สำเร็จ'); return }
      setBody(data.data.body) // ให้ autosave effect เซฟเอง — ไม่เรียก PATCH ซ้ำ
    } catch {
      setAiError('ร่างด้วย AI ไม่สำเร็จ')
    } finally {
      setAiLoading(false)
    }
  }

  async function changeStatus(status) {
    setStatusLoading(true)
    setStatusError('')
    try {
      const res = await fetch(`/api/posts/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setStatusError(data.error || 'เปลี่ยนสถานะไม่สำเร็จ'); return }
      setPost(data.data.post)
      window.dispatchEvent(new CustomEvent('posts:changed', { detail: { id, status: data.data.post.status } }))
      // can เดิมคำนวณจาก status เก่า — โหลดใหม่เพื่อได้ can ที่ตรงกับสถานะปัจจุบัน
      load()
    } catch {
      setStatusError('เปลี่ยนสถานะไม่สำเร็จ')
    } finally {
      setStatusLoading(false)
    }
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  if (loadError) return <p className="text-red-500 text-sm">{loadError}</p>
  if (!post) return null

  const readOnly = !can.edit
  const status = post.status

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        readOnly={readOnly}
        placeholder="ชื่อโพสต์"
        className="w-full h-11 px-3 text-lg font-semibold rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-teal read-only:opacity-70"
      />

      <textarea
        ref={bodyRef}
        value={body}
        onChange={e => { setBody(e.target.value); autoGrow(e.target) }}
        readOnly={readOnly}
        rows={10}
        placeholder="เนื้อหาโพสต์..."
        className="w-full px-3 py-2.5 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 focus:outline-none focus:ring-2 focus:ring-teal resize-none overflow-hidden read-only:opacity-70 min-h-[240px]"
      />

      {readOnly && (
        <p className="text-sm text-amber-600 dark:text-disc-muted">
          {status === 'approved' ? 'อนุมัติแล้ว — กดขอแก้ก่อน' : 'ไม่มีสิทธิ์แก้ไขโพสต์นี้'}
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {/* ป้ายสถานะบันทึก */}
        <span className="text-sm text-warm-500 dark:text-disc-muted flex items-center gap-1.5 min-w-[90px]">
          {saveState === 'saving' && <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก...</>}
          {saveState === 'saved' && <><Check size={14} className="text-green-600" /> บันทึกแล้ว</>}
        </span>

        {can.edit && (
          <button
            onClick={handleAiDraft}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 disabled:opacity-40 transition"
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            ร่างด้วย AI
          </button>
        )}

        {status === 'draft' && can.edit && (
          <button
            onClick={() => changeStatus('review')}
            disabled={statusLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            <Send size={14} /> ขอตรวจ
          </button>
        )}

        {status === 'review' && can.approve && (
          <button
            onClick={() => changeStatus('approved')}
            disabled={statusLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            <ThumbsUp size={14} /> อนุมัติ
          </button>
        )}

        {status === 'approved' && can.requestChanges && (
          <button
            onClick={() => changeStatus('draft')}
            disabled={statusLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 disabled:opacity-40 transition"
          >
            <Undo2 size={14} /> ขอแก้
          </button>
        )}

        <span className="text-sm px-2.5 py-1 rounded-full border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text">
          {STATUS_LABEL[status] || status}
        </span>

        {can.edit && (
          <button
            onClick={handleDeletePost}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-warm-500 dark:text-disc-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover transition"
          >
            <Trash2 size={14} /> เก็บเข้ากรุ
          </button>
        )}
      </div>

      {aiError && <p className="text-sm text-red-500">{aiError}</p>}
      {statusError && <p className="text-sm text-red-500">{statusError}</p>}

      <PostRevisions id={id} canEdit={!!can.edit} onRestore={handleRestoreRevision} refreshKey={savedCount} />

      {conflict && (
        <ConflictDialog onReload={handleReload} onKeepAsRevision={handleKeepAsRevision} keeping={keepingRevision} />
      )}
    </div>
  )
}
