'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Sparkles, X, Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import PostRevisions from './PostRevisions.jsx'


// AI ทุกแบบอยู่ในเมนูเดียว — draft/caption ยิงคนละ endpoint · ที่เหลือคือ tone ของ polish
const AI_MODES = [
  ['draft', 'ร่างใหม่ทั้งหมด'],
  ['polish', 'เกลาสำนวน'],
  ['shorter', 'ย่อให้สั้น'],
  ['friendly', 'เป็นกันเองขึ้น'],
  ['caption', 'แคปชัน + ไอเดียภาพ'],
]

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

// กล่องยืนยันของหน้านี้ — แทน confirm() ของเบราว์เซอร์ · ปิดได้ 3 ทาง X + ESC + คลิกนอก (กฎ CLAUDE.md)
function ConfirmDialog({ ask, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card-bg rounded-xl shadow-lg max-w-md w-full border border-warm-200 dark:border-disc-border">
        <div className="flex items-center justify-between p-5 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">{ask.title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-warm-400 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <p className="text-base text-warm-500 dark:text-disc-muted">{ask.message}</p>
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => { onClose(); ask.onConfirm() }}
              className={`px-4 py-2 text-base font-medium rounded-lg text-white hover:opacity-90 transition ${ask.danger ? 'bg-red-500' : 'bg-teal'}`}
            >
              {ask.confirmLabel}
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
  const [category, setCategory] = useState('')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const [pendingSave, setPendingSave] = useState(false)  // พิมพ์แล้วแต่ debounce ยังไม่ยิง = ยังไม่ปลอดภัยที่จะปิดแท็บ
  const [conflict, setConflict] = useState(false)
  const [keepingRevision, setKeepingRevision] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [polishing, setPolishing] = useState(false)
  // AI ทุกแบบรวมเป็นเมนูเดียว — เดิมแยก 3 ปุ่มแล้วอ่านไม่ออกว่าต่างกันยังไง
  const [aiMode, setAiMode] = useState('polish')  // draft | polish | shorter | friendly | caption
  const [confirmAsk, setConfirmAsk] = useState(null)  // { title, message, confirmLabel, danger, onConfirm }
  const [suggesting, setSuggesting] = useState(false)
  // ข้อเสนอ AI ที่เก็บไว้ทั้งหมด (ใหม่สุดบน) — แต่ละชุด = { id, payload:{captions[],imageIdeas[]}, created_at, author_name }
  const [suggestions, setSuggestions] = useState([])
  const [suggestCollapsed, setSuggestCollapsed] = useState(false)
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
      setCategory(data.data.post.category || '')
      lockTokenRef.current = data.data.post.lock_token
    } catch {
      setLoadError('โหลดโพสต์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { autoGrow(bodyRef.current) }, [loading, body])

  // ข้อเสนอ AI ที่เคยขอไว้ — โหลดตอนเปิดหน้า จะได้ไม่ต้องกดใหม่ (กดใหม่ = เสียโควตารายวัน)
  useEffect(() => {
    fetch(`/api/posts/${id}/ai-suggestions`)
      .then(res => (res.ok ? res.json() : { data: [] }))
      .then(json => setSuggestions(json.data || []))
      .catch(() => {})
  }, [id])

  // การ์ด "สื่อ" (คอลัมน์ขวา) เป็นที่เดียวที่แก้หมวด แต่ยิง PATCH เองไม่ได้ —
  // ทุก PATCH bump updated_at → lockToken ที่นี่หมดอายุ แล้ว autosave เด้ง 409 ทันที (bug-071)
  // → มันแค่ส่งค่ามาให้ แล้วปล่อยให้ autosave ของ editor เซฟด้วย token ที่ยังใช้ได้
  useEffect(() => {
    function onSetCategory(e) {
      if (e.detail?.id !== id) return
      setCategory(e.detail.category || '')
    }
    window.addEventListener('posts:set-category', onSetCategory)
    return () => window.removeEventListener('posts:set-category', onSetCategory)
  }, [id])

  // ปุ่มสถานะอยู่การ์ดขวา แต่ยิง API ที่นี่ด้วยเหตุผลเดียวกับหมวด (lockToken — bug-071)
  useEffect(() => {
    function onRequestStatus(e) {
      if (e.detail?.id !== id || !e.detail?.status) return
      changeStatus(e.detail.status)
    }
    window.addEventListener('posts:request-status', onRequestStatus)
    return () => window.removeEventListener('posts:request-status', onRequestStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    if (blockedRef.current) return
    if (!loadedRef.current) return          // ยังโหลดไม่เสร็จ = ค่าที่เห็นยังเป็นค่าว่าง ห้ามเซฟทับ
    clearTimeout(saveTimer.current)
    setPendingSave(true)
    saveTimer.current = setTimeout(save, 800)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, category])

  // ไม่มีปุ่มบันทึกแล้ว → ด่านเดียวที่กันงานหายคือตรงนี้ (กฎ CLAUDE.md §กฎการบันทึก ฉบับแก้ 2026-07-30)
  // ปิดแท็บ/กดถอยตอน debounce 800ms ยังไม่ครบ หรือ PATCH ยังไม่กลับ = เตือนก่อน
  useEffect(() => {
    if (!pendingSave && saveState !== 'saving') return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [pendingSave, saveState])

  async function save() {
    if (blockedRef.current) return
    if (!loadedRef.current || !lockTokenRef.current) return   // ด่านสุดท้ายก่อนยิง PATCH (ดู bug-071)
    setPendingSave(false)   // ยิงแล้ว — ต่อจากนี้ saveState คุมการเตือน beforeunload แทน
    setSaveState('saving')
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockToken: lockTokenRef.current, title, body, category: category.trim() || null }),
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
      // ส่ง category กลับไปด้วย — การ์ดขวาอัปเดตแบบ optimistic ไว้ ค่าจริงหลังเซฟคือค่านี้
      window.dispatchEvent(new CustomEvent('posts:changed', { detail: { id, category: data.data.post.category ?? null } }))
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

  // เก็บฉบับที่เห็นอยู่ตอนนี้เป็น revision — เรียกก่อน "ทุกครั้ง" ที่จะเขียนทับเนื้อหาทั้งก้อน
  // (AI ร่าง/เกลา, กู้คืนฉบับเก่า) เพราะ revision อัตโนมัติมีเว้นช่วง 15 นาที = ของที่ทับอาจไม่ถูกเก็บ
  async function snapshotCurrent() {
    try {
      await fetch(`/api/posts/${id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      setSavedCount(c => c + 1)
    } catch { /* เก็บไม่ได้ก็ทำงานต่อ — ไม่บล็อกคนใช้ */ }
  }

  // กู้คืนฉบับเก่า — เก็บฉบับปัจจุบันก่อน แล้วค่อยใส่ของเก่าลงกล่อง (autosave เซฟต่อเอง)
  function handleRestoreRevision(rev) {
    setConfirmAsk({
      title: 'กู้คืนฉบับนี้?',
      message: 'เนื้อหาปัจจุบันจะถูกทับ — แต่จะถูกเก็บไว้ในประวัติก่อนเสมอ กลับมาเอาคืนได้',
      confirmLabel: 'กู้คืนทับเลย',
      onConfirm: async () => {
        await snapshotCurrent()
        setTitle(rev.title || '')
        setBody(rev.body || '')
      },
    })
  }

  // เกลาสำนวน — AI แตะแค่ภาษา ไม่เพิ่มประเด็น (ส่งของที่กำลังพิมพ์อยู่ไป ไม่ต้องรอ autosave)
  async function handlePolish(tone) {
    if (!body.trim()) { setAiError('ยังไม่มีเนื้อหาให้เกลา'); return }
    setPolishing(true)
    setAiError('')
    try {
      const res = await fetch('/api/posts/ai/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: id, body, tone }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAiError(data.error || 'เกลาสำนวนไม่สำเร็จ'); return }
      await snapshotCurrent()
      setBody(data.data.body)
    } catch {
      setAiError('เกลาสำนวนไม่สำเร็จ')
    } finally {
      setPolishing(false)
    }
  }

  async function handleSuggest() {
    if (!body.trim()) { setAiError('ยังไม่มีเนื้อหา — เขียนก่อนแล้วค่อยขอแคปชัน'); return }
    setSuggesting(true)
    setAiError('')
    try {
      const res = await fetch('/api/posts/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: id, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAiError(data.error || 'ขอแคปชันไม่สำเร็จ'); return }
      // ต่อท้ายชุดใหม่ไว้บนสุด ไม่ทับของเก่า · `saved` = แถวจริงใน DB (null ถ้า insert ล้ม — ยังโชว์ให้ดูได้)
      const fresh = data.data.saved || {
        id: `tmp-${Date.now()}`,
        payload: { captions: data.data.captions, imageIdeas: data.data.imageIdeas },
        created_at: new Date().toISOString(),
      }
      setSuggestCollapsed(false)
      setSuggestions(prev => [fresh, ...prev])
    } catch {
      setAiError('ขอแคปชันไม่สำเร็จ')
    } finally {
      setSuggesting(false)
    }
  }

  function handleDeleteSuggestion(sid) {
    setConfirmAsk({
      title: 'ลบข้อเสนอชุดนี้?',
      message: 'ลบแล้วเอากลับไม่ได้ — ถ้าอยากได้ใหม่ต้องกดขอ AI อีกครั้ง (เสียโควตาเพิ่ม 1 ครั้ง)',
      confirmLabel: 'ลบเลย',
      danger: true,
      onConfirm: async () => {
        setSuggestions(prev => prev.filter(s => s.id !== sid))
        await fetch(`/api/posts/${id}/ai-suggestions?sid=${sid}`, { method: 'DELETE' }).catch(() => {})
      },
    })
  }

  function handleDeletePost() {
    setConfirmAsk({
      title: 'เก็บโพสต์เข้ากรุ?',
      message: 'ยังไม่หายไปไหน — กู้คืนได้ที่ "ในกรุ" ท้ายหัวรายการในหน้า /posts',
      confirmLabel: 'เก็บเข้ากรุ',
      danger: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' })
          if (res.ok) router.push('/posts')
        } catch { /* ลบไม่สำเร็จ = อยู่หน้าเดิม ผู้ใช้กดใหม่ได้ */ }
      },
    })
  }

  // ร่างใหม่ = ทับเนื้อหาทั้งก้อน → ถามก่อนถ้ามีของอยู่แล้ว
  function handleAiDraft() {
    if (!body.trim()) return runAiDraft()
    setConfirmAsk({
      title: 'ให้ AI เขียนใหม่ทั้งหมด?',
      message: 'เนื้อหาที่มีอยู่จะถูกเขียนทับ — ฉบับปัจจุบันจะถูกเก็บไว้ในประวัติก่อนเสมอ',
      confirmLabel: 'เขียนทับเลย',
      onConfirm: async () => { await snapshotCurrent(); runAiDraft() },
    })
  }

  async function runAiDraft() {
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

  // ปุ่ม AI ปุ่มเดียว — แยกทางตาม aiMode ที่เลือกใน dropdown
  function runAi() {
    if (aiMode === 'draft') return handleAiDraft()
    if (aiMode === 'caption') return handleSuggest()
    return handlePolish(aiMode)   // polish | shorter | friendly
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
  const aiBusy = aiLoading || polishing || suggesting

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

      {/* หมวด — ตัวควบคุมย้ายไปอยู่การ์ด "สื่อ" คอลัมน์ขวาแล้ว (เคาะ 2026-07-30 — เดิมโชว์ซ้ำ 2 ที่)
          ที่นี่เหลือแค่ state + autosave เพราะ lockToken อยู่กับ editor ตัวเดียว ห้ามให้การ์ดขวา PATCH เอง */}

      {readOnly && (
        <p className="text-sm text-amber-600 dark:text-disc-muted">
          {status === 'approved' ? 'อนุมัติแล้ว — กด "กลับไปแก้" ก่อนถึงจะแก้ได้' : 'ไม่มีสิทธิ์แก้ไขโพสต์นี้'}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {/* ไม่มีปุ่ม "บันทึก" — กฎเปลี่ยน 2026-07-30 เย็น: หน้า Update ที่มี autosave ห้ามมีปุ่มบันทึก
            สิ่งที่ต้องมีแทน (บังคับ) = ป้ายสถานะข้างล่างนี้ + beforeunload ตอนยังเซฟไม่เสร็จ */}

        {/* ป้ายสถานะบันทึก — ไม่จองที่ว่างตอนไม่ได้เซฟ */}
        {saveState !== 'idle' && (
          <span className="text-sm text-warm-500 dark:text-disc-muted flex items-center gap-1.5">
            {saveState === 'saving' && <><Loader2 size={14} className="animate-spin" /> กำลังบันทึก...</>}
            {saveState === 'saved' && <><Check size={14} className="text-green-600" /> บันทึกแล้ว</>}
          </span>
        )}

        {/* AI ปุ่มเดียว — เลือกว่าจะให้ทำอะไรจาก dropdown (เดิมแยก 3 ปุ่มแล้วอ่านไม่ออกว่าต่างกันยังไง) */}
        {can.edit && (
          <div className="flex items-center ml-1">
            <select
              value={aiMode}
              onChange={e => setAiMode(e.target.value)}
              className="h-9 px-2 text-sm rounded-l-lg border border-r-0 border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
            >
              {AI_MODES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            {/* สีที่ 3 ของแถวปุ่ม — teal = บันทึก · ส้ม = ส่งตรวจ ถูกจองไปแล้ว
                ม่วงเลยเป็นสี AI ประจำหน้านี้ (กันอ่านสลับกับ 2 ปุ่มนั้น) */}
            <button
              onClick={runAi}
              disabled={aiBusy || (aiMode !== 'draft' && !body.trim())}
              title={aiMode === 'draft' ? 'เขียนใหม่ทั้งก้อน (ทับของเดิม)' : aiMode === 'caption' ? 'เสนอแคปชัน/ไอเดียภาพ ไม่แตะเนื้อหา' : 'ขัดภาษาของที่มีอยู่ ไม่เพิ่มประเด็นใหม่'}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-r-lg bg-violet-600 text-white hover:opacity-90 disabled:opacity-40 transition"
            >
              {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              ให้ AI ช่วย
            </button>
          </div>
        )}

        {/* ปุ่มเปลี่ยนสถานะ (ส่งตรวจ/อนุมัติ/ถอนกลับ/กลับไปแก้) ย้ายไปอยู่ข้าง "สถานะ" ในการ์ด meta แล้ว
            (2026-07-30 — 5 ปุ่มในแถวเดียวแตกเป็น 3 บรรทัดเบี้ยวบนมือถือ)
            แต่ **การยิง API ยังอยู่ที่นี่** เพราะ setPostStatus bump updated_at → lockToken ของ editor
            หมดอายุ ต้องรีโหลดต่อทันที ถ้าให้การ์ดขวายิงเอง autosave จะเด้ง 409 (bug-071) */}

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

      {/* ข้อเสนอจาก AI — เก็บถาวรใน post_ai_suggestions แล้ว (2026-07-31) เปิดหน้ามาก็ยังอยู่
          ไม่ต้องกดใหม่ให้เสียโควตา · ขอใหม่ = ต่อท้าย ไม่ทับของเก่า · ทิ้งได้ทีละชุดด้วยปุ่มถังขยะ */}
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-warm-200 dark:border-disc-border p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide">
              ข้อเสนอจาก AI ({suggestions.length})
            </h3>
            {/* ปุ่มนี้ = ย่อ/ขยาย ไม่ใช่ปิดทิ้ง — ของถูกเก็บไว้แล้ว จะทิ้งต้องกดถังขยะรายชุด */}
            <button
              onClick={() => setSuggestCollapsed(v => !v)}
              title={suggestCollapsed ? 'ขยาย' : 'ย่อ'}
              className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
            >
              {suggestCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>

          {!suggestCollapsed && suggestions.map(sg => (
            <div key={sg.id} className="flex flex-col gap-1.5 pt-2 border-t border-warm-200 dark:border-disc-border first:pt-0 first:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-warm-500 dark:text-disc-muted">
                  {new Date(sg.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  {sg.author_name || sg.created_by_name ? ` · ${sg.author_name || sg.created_by_name}` : ''}
                </span>
                {can.edit && (
                  <button
                    onClick={() => handleDeleteSuggestion(sg.id)}
                    title="ลบข้อเสนอชุดนี้"
                    className="shrink-0 p-1 rounded text-warm-400 dark:text-disc-muted hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {[
                { label: '✏️ แคปชันสั้น', items: sg.payload?.captions },
                { label: '📸 ไอเดียภาพประกอบ', items: sg.payload?.imageIdeas },
              ].map(({ label, items }) => (items || []).length > 0 && (
                <div key={label} className="flex flex-col gap-1.5">
                  <span className="text-sm text-warm-700 dark:text-disc-text">{label}</span>
                  {items.map((s, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 rounded-lg bg-warm-50 dark:bg-disc-hover px-2 py-1.5">
                      <span className="text-sm text-warm-900 dark:text-disc-text break-words">{s}</span>
                      <button
                        onClick={() => navigator.clipboard?.writeText(s)}
                        title="คัดลอก"
                        className="shrink-0 p-1 rounded text-warm-500 dark:text-disc-muted hover:text-teal"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          {!suggestCollapsed && (
            <p className="text-sm text-warm-500 dark:text-disc-muted">
              เก็บไว้ให้แล้ว เปิดมาดูได้ตลอด — แต่ไม่ได้ใส่ลงเนื้อหาโพสต์ให้ ต้องคัดลอกไปใช้เอง
            </p>
          )}
        </div>
      )}

      <PostRevisions id={id} canEdit={!!can.edit} onRestore={handleRestoreRevision} refreshKey={savedCount} />

      {conflict && (
        <ConflictDialog onReload={handleReload} onKeepAsRevision={handleKeepAsRevision} keeping={keepingRevision} />
      )}

      {confirmAsk && <ConfirmDialog ask={confirmAsk} onClose={() => setConfirmAsk(null)} />}
    </div>
  )
}
