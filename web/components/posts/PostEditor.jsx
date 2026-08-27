'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Sparkles, X, Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import PostRevisions from './PostRevisions.jsx'
import EmojiPicker from './EmojiPicker.jsx'


// AI ทุกแบบอยู่ในเมนูเดียว — draft/caption/review ยิงคนละ endpoint · ที่เหลือคือ tone ของ polish
const AI_MODES = [
  ['draft', 'ร่างใหม่ทั้งหมด'],
  ['polish', 'เกลาสำนวน'],
  ['shorter', 'ย่อให้สั้น'],
  ['friendly', 'เป็นกันเองขึ้น'],
  ['caption', 'ให้คำแนะนำ'],
  ['review', 'ตรวจก่อนเผยแพร่'],
]

// ป้ายหมวดความเสี่ยงจาก /api/posts/ai/review — key ต้องตรงกับ RISK_CATEGORIES ฝั่ง route
const RISK_LABEL = {
  defamation: 'พาดพิง/หมิ่นประมาท',
  factual_risk: 'ข้อมูลไม่มีที่มา',
  privacy: 'ข้อมูลส่วนบุคคล',
  attack_tone: 'น้ำเสียงโจมตี',
  sexual_harassment: 'เนื้อหาเชิงเพศ',
  victim_blaming: 'โทษผู้เสียหาย',
  vulnerable_group: 'กลุ่มเปราะบาง',
  divisive: 'สร้างความแตกแยก',
  party_tone: 'ภาพลักษณ์พรรค',
}

// สีตามระดับ — high ต้องสะดุดตากว่าที่เหลือชัดเจน ไม่งั้นบรรณาธิการกวาดตาผ่าน
const SEVERITY_STYLE = {
  high: { label: 'ควรแก้ก่อนเผยแพร่', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  medium: { label: 'ควรพิจารณา', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  low: { label: 'สังเกตไว้', className: 'bg-warm-100 text-warm-600 dark:bg-disc-hover dark:text-disc-muted' },
}

/**
 * ผลตรวจจาก AI บรรณาธิการ (kind='review') — โครงคนละแบบกับ caption สิ้นเชิง
 * caption เป็น array ของ string ล้วน · ที่นี่เป็น object มี severity/excerpt จึงต้องแยก render
 * (ถ้าปล่อยให้ตกไปที่ list ของ caption จะได้การ์ดเปล่าที่มีแต่วันที่ — ผู้ใช้เสียโควตาฟรี)
 *
 * ⛔ ห้ามเติมป้าย "ผ่าน/ไม่ผ่าน" ตรงนี้เด็ดขาด — ฟีเจอร์นี้คือผู้ช่วยตรวจ ไม่ใช่ผู้อนุมัติ
 *    ปุ่มอนุมัติจริงอยู่การ์ดขวา (PostMetaPanel) และต้องเป็นคนกดเสมอ
 */
function ReviewResult({ payload, stale }) {
  // toggle ปิดไว้ก่อนเหมือนหมวดอื่น (โควต/หัวข้อ/ไอเดียภาพ) — กันโชว์รวดเดียวรกจอ
  const [open, setOpen] = useState(false)
  const risks = Array.isArray(payload?.risks) ? payload.risks : []
  const counts = payload?.counts || {}

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between gap-2 text-sm text-warm-700 dark:text-disc-text hover:opacity-80"
      >
        <span className="flex items-center gap-2 flex-wrap">
          🔍 ผลตรวจก่อนเผยแพร่
          {risks.length > 0 && (
            <span className="text-xs text-warm-500 dark:text-disc-muted">
              พบ {risks.length} จุด
              {counts.high ? ` · ควรแก้ก่อน ${counts.high}` : ''}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <>
          {stale && (
            <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2">
              ตรวจกับเนื้อหาฉบับก่อนหน้า — เนื้อหาถูกแก้หลังจากนี้แล้ว ถ้าจะใช้ตัดสินใจ ควรกดตรวจใหม่
            </p>
          )}

          {risks.length === 0 ? (
            // ⛔ ถ้อยคำตรงนี้สำคัญ — ห้ามเขียนว่า "ผ่าน" หรือ "ปลอดภัย" เพราะจะกลายเป็นไฟเขียวจาก AI
            <p className="text-sm text-warm-500 dark:text-disc-muted">
              AI ไม่พบจุดที่ต้องทัก — ไม่ได้แปลว่าโพสต์นี้ปลอดภัย ยังต้องใช้วิจารณญาณของบรรณาธิการเหมือนเดิม
            </p>
          ) : (
            // การ์ดเดียวรวมทุกจุดที่พบ คั่นแถวด้วย divide-y — เดิมแยกกล่อง rounded ต่อจุดทำให้ดูเป็นหลายการ์ด
            <div className="rounded-lg border border-warm-200 dark:border-disc-border divide-y divide-warm-200 dark:divide-disc-border">
              {risks.map((r, i) => {
                const sev = SEVERITY_STYLE[r.severity] || SEVERITY_STYLE.medium
                return (
                  <div key={i} className="flex flex-col gap-1 px-2.5 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${sev.className}`}>{sev.label}</span>
                      <span className="text-sm font-medium text-warm-900 dark:text-disc-text">
                        {RISK_LABEL[r.category] || r.category}
                      </span>
                    </div>
                    {/* excerpt ที่หาไม่เจอในต้นฉบับถูกตัดเป็นสตริงว่างมาจาก server แล้ว (กัน AI กุคำพูด) */}
                    {r.excerpt && (
                      <p className="text-sm text-warm-700 dark:text-disc-text border-l-2 border-warm-300 dark:border-disc-border pl-2 italic break-words">
                        “{r.excerpt}”
                      </p>
                    )}
                    <p className="text-sm text-warm-700 dark:text-disc-text break-words">{r.reason}</p>
                    {r.suggestion && (
                      <p className="text-sm text-warm-500 dark:text-disc-muted break-words">แนะนำ: {r.suggestion}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

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
  const [saveError, setSaveError] = useState('')      // เซฟไม่ผ่าน (เน็ตหลุด/500/403) — เดิม return เงียบ
  const [liveEditor, setLiveEditor] = useState(null)  // { name } — คนที่เพิ่งแก้โพสต์นี้ ≈ "กำลังแก้อยู่"
  const [remoteEdit, setRemoteEdit] = useState(null)  // { name } — คนอื่นแก้ไปแล้วขณะที่เรามีของค้าง
  const [keepingRevision, setKeepingRevision] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [polishing, setPolishing] = useState(false)
  // AI ทุกแบบรวมเป็นเมนูเดียว — เดิมแยก 3 ปุ่มแล้วอ่านไม่ออกว่าต่างกันยังไง
  const [aiMode, setAiMode] = useState('caption')  // draft | polish | shorter | friendly | caption | review
  const [confirmAsk, setConfirmAsk] = useState(null)  // { title, message, confirmLabel, danger, onConfirm }
  const [suggesting, setSuggesting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  // ข้อเสนอ AI ที่เก็บไว้ทั้งหมด (ใหม่สุดบน) — แต่ละชุด = { id, payload:{captions[],imageIdeas[]}, created_at, author_name }
  const [suggestions, setSuggestions] = useState([])
  const [suggestCollapsed, setSuggestCollapsed] = useState(true)
  // toggle แยกรายหมวด (โควต/หัวข้อ/ไอเดียภาพ/hashtag) ต่อชุดข้อเสนอ — ปิดไว้ก่อนกันโชว์รกทีเดียวหมด, key = `${sg.id}:${label}`
  const [openCat, setOpenCat] = useState({})
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState('')

  const lockTokenRef = useRef(null)
  const loadedRef = useRef(false)      // เนื้อหาจริงเข้ากล่องแล้วหรือยัง — กัน autosave ยิงทับตอนยังว่าง
  const isFirstLoad = useRef(true)
  const blockedRef = useRef(false)
  const saveTimer = useRef(null)
  const retryTimer = useRef(null)
  const retryCount = useRef(0)
  const bodyRef = useRef(null)

  // ⭐ "มีของค้างที่ยังไม่ถึง DB ไหม" — ต้องเทียบกับค่าที่เซิร์ฟเวอร์ **รับไปแล้วจริงๆ** เท่านั้น
  //    ห้ามใช้ pendingSave/saveState แทนเด็ดขาด: save() เคลียร์ pendingSave ตั้งแต่ก่อนยิง PATCH
  //    แล้วเส้นทางล้มเหลว (เน็ตหลุด / 500 / 403) เคย return เงียบ → ของค้างอยู่ในกล่องแต่ทั้ง 2 ตัวบอกว่า "ว่าง"
  //    ถ้าเอา 2 ตัวนั้นไปตัดสินการรีเฟรช = ทับงานที่ยังไม่ได้เซฟทิ้ง (ทางเดียวกับ bug-071 คนละสาเหตุ)
  const savedRef = useRef({ title: '', body: '', category: '' })
  const valuesRef = useRef({ title: '', body: '', category: '' })
  const busyRef = useRef(false)
  valuesRef.current = { title, body, category: category.trim() }
  busyRef.current = !!confirmAsk || conflict || keepingRevision
  const canEditRef = useRef(false)
  canEditRef.current = !!can.edit

  function markSaved(t, b, c) { savedRef.current = { title: t, body: b, category: c } }
  // ทุกจังหวะที่ savedRef ถูกเขียนจะมี setState คู่กันเสมอ → ค่านี้สดทุก render
  const dirty = title !== savedRef.current.title
    || body !== savedRef.current.body
    || category.trim() !== savedRef.current.category
  // เวอร์ชัน ref — ปลอดภัยเมื่อเรียกจาก setInterval / event listener ที่ปิดทับค่าเก่าไว้
  function dirtyNow() {
    const s = savedRef.current, v = valuesRef.current
    return v.title !== s.title || v.body !== s.body || v.category !== s.category
  }

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
      markSaved(data.data.post.title || '', data.data.post.body || '', data.data.post.category || '')
      setSaveError('')
      setRemoteEdit(null)
      lockTokenRef.current = data.data.post.lock_token
    } catch {
      setLoadError('โหลดโพสต์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { autoGrow(bodyRef.current) }, [loading, body])
  useEffect(() => () => clearTimeout(retryTimer.current), [])

  /**
   * ดึงฉบับล่าสุดมาแบบเงียบๆ — เงื่อนไขเดียวคือ **ต้องไม่มีของค้าง**
   * ⛔ ห้ามเรียก load() แทน: load() ตั้ง loading = true แล้วทั้ง editor ถูกแทนด้วย "กำลังโหลด..."
   *    (ดูบรรทัด `if (loading) return`) = จอกระพริบ + caret/scroll หาย ทุกครั้งที่สลับแท็บกลับมา
   */
  async function refreshQuiet() {
    if (blockedRef.current || busyRef.current) return
    if (!loadedRef.current || dirtyNow()) return
    try {
      const res = await fetch(`/api/posts/${id}`)
      if (!res.ok) return
      const data = await res.json()
      const p = data.data.post
      if (!p || p.lock_token === lockTokenRef.current) return
      if (dirtyNow() || blockedRef.current) return   // พิมพ์แทรก/ชนไปแล้วระหว่างรอ response
      const v = valuesRef.current
      const same = (p.title || '') === v.title && (p.body || '') === v.body && (p.category || '') === v.category
      // isFirstLoad กิน effect autosave ได้ **รอบเดียว** — ถ้าค่าไม่เปลี่ยน effect จะไม่ทำงาน
      // แล้วธงจะค้างไปกินคีย์ถัดไปของ user แทน (= พิมพ์แล้วไม่เซฟ) จึงตั้งเฉพาะตอนค่าเปลี่ยนจริง
      if (!same) isFirstLoad.current = true
      setPost(p)
      setCan(data.data.can || {})
      setTitle(p.title || '')
      setBody(p.body || '')
      setCategory(p.category || '')
      markSaved(p.title || '', p.body || '', p.category || '')
      lockTokenRef.current = p.lock_token
      setRemoteEdit(null)
    } catch {}
  }

  // แท็บที่เปิดค้างไว้ = ถือ token เก่า พอพิมพ์ตัวแรกก็เด้ง 409 ทั้งที่ยังไม่ได้ทำอะไรผิด
  // → กลับมาโฟกัสเมื่อไหร่ ถ้ามือยังว่าง ก็เปลี่ยนเป็นฉบับล่าสุดเสียตั้งแต่ก่อนพิมพ์
  useEffect(() => {
    function onFocus() { refreshQuiet() }
    function onVis() { if (document.visibilityState === 'visible') refreshQuiet() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ชีพจร — รู้ว่ามีคนแก้ "ก่อน" จะไปชน แทนที่จะรู้ตอนชนแล้ว
  // ⛔ lockToken จากที่นี่ใช้ **เทียบ** อย่างเดียว ห้ามใส่ lockTokenRef (จะกลายเป็น last-write-wins — bug-071)
  useEffect(() => {
    let stopped = false
    async function tick() {
      // ⚠️ ทุกเงื่อนไขข้างล่างนี้คือบทเรียนจาก prod ล่ม 504 (bug-459) — แท็บที่เปิดค้างไว้เฉยๆ
      //    ต้องไม่ยิงอะไรเลย · pulse มีประโยชน์เฉพาะตอน "คนนั่งมองจออยู่และแก้ได้" เท่านั้น
      if (stopped || document.visibilityState !== 'visible') return
      if (!document.hasFocus()) return          // เปิดค้างไว้หลังหน้าต่างอื่น = ไม่ต้องรู้อะไรทั้งนั้น
      if (!canEditRef.current) return           // อ่านอย่างเดียว ไม่มีทางชนกับใคร
      if (blockedRef.current || busyRef.current) return
      try {
        const res = await fetch(`/api/posts/${id}/pulse`)
        if (!res.ok || stopped) return
        const { data } = await res.json()
        if (!data || stopped) return
        // "เพิ่งแก้ภายใน 90 วิ" = ยังนั่งอยู่หน้าจอ (autosave เด้งทุก 800ms ระหว่างพิมพ์)
        const fresh = data.updatedAt && Date.now() - new Date(data.updatedAt).getTime() < 90000
        setLiveEditor(fresh && !data.byMe && data.editorName ? { name: data.editorName } : null)
        if (data.lockToken === lockTokenRef.current) { setRemoteEdit(null); return }
        if (dirtyNow()) setRemoteEdit({ name: data.editorName || null })
        else refreshQuiet()
      } catch {}
    }
    // 60 วิ ไม่ใช่ 20 — คนกลับมาที่แท็บเมื่อไหร่มี refreshQuiet() ของชั้น 1 ดักให้อยู่แล้ว
    // pulse มีไว้จับเคสเดียวคือ "นั่งจ้องจออยู่ทั้งคู่พร้อมกัน" ซึ่งรอ 1 นาทีได้
    const iv = setInterval(tick, 60000)
    return () => { stopped = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

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
    clearTimeout(retryTimer.current)   // คีย์ล่าสุดชนะ retry ที่ถือค่าเก่าไว้เสมอ
    retryCount.current = 0
    setPendingSave(true)
    saveTimer.current = setTimeout(save, 800)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, category])

  // ไม่มีปุ่มบันทึกแล้ว → ด่านเดียวที่กันงานหายคือตรงนี้ (กฎ CLAUDE.md §กฎการบันทึก ฉบับแก้ 2026-07-30)
  // ปิดแท็บ/กดถอยตอน debounce 800ms ยังไม่ครบ หรือ PATCH ยังไม่กลับ = เตือนก่อน
  useEffect(() => {
    // dirty ต้องอยู่ในเงื่อนไขด้วย — เซฟล้มเหลวจะไม่มีทั้ง pendingSave และ saving แต่ของยังค้างอยู่ในกล่อง
    if (!dirty && !pendingSave && saveState !== 'saving') return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, pendingSave, saveState])

  // ลองใหม่แบบถอยห่างขึ้นเรื่อยๆ — 5 → 15 → 45 วิ แล้วหยุด
  // ⛔ ห้ามกลับไปยิงถี่คงที่: ตอนเซิร์ฟเวอร์กำลังจะไม่ไหว การ retry ถี่ๆ จากทุกแท็บคือสิ่งที่ผลักให้ล่มจริง
  //    (retry storm — ส่วนหนึ่งของ prod 504 2026-08-27 bug-459)
  // ครบเพดานแล้วหยุด แต่ข้อความค้างไว้ + beforeunload ยังกันปิดแท็บอยู่ (ของยังไม่หาย)
  const RETRY_DELAYS = [5000, 15000, 45000]
  function scheduleRetry() {
    const delay = RETRY_DELAYS[retryCount.current]
    if (!delay) {
      setSaveError('บันทึกไม่สำเร็จหลายครั้ง — ก๊อปข้อความที่พิมพ์ไว้เก็บก่อน แล้วลองรีโหลดหน้า')
      return
    }
    retryCount.current += 1
    retryTimer.current = setTimeout(save, delay)
  }

  async function save() {
    if (blockedRef.current) return
    if (!loadedRef.current || !lockTokenRef.current) return   // ด่านสุดท้ายก่อนยิง PATCH (ดู bug-071)
    clearTimeout(retryTimer.current)
    const sent = { title, body, category: category.trim() }   // ค่าที่ยิงไปจริงในรอบนี้ (อาจพิมพ์ต่อระหว่างรอ)
    setPendingSave(false)   // ยิงแล้ว — ต่อจากนี้ dirty/saveState คุมการเตือน beforeunload แทน
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
      if (!res.ok) {
        // เดิมบรรทัดนี้คือ `return` เงียบๆ — user พิมพ์ต่อไปเรื่อยๆ โดยไม่รู้ว่าไม่มีอะไรลง DB เลย
        setSaveState('idle')
        setSaveError(data.error || 'บันทึกไม่สำเร็จ')
        // 403 = อนุมัติแล้ว/ไม่มีสิทธิ์ → ลองใหม่กี่ครั้งก็ไม่ผ่าน อย่ายิงซ้ำให้เปลือง
        if (res.status !== 403) scheduleRetry()
        return
      }
      lockTokenRef.current = data.data.post.lock_token
      retryCount.current = 0
      markSaved(sent.title, sent.body, sent.category)
      setSaveError('')
      setRemoteEdit(null)
      setPost(data.data.post)
      setSavedCount(c => c + 1)
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
      // ส่ง category กลับไปด้วย — การ์ดขวาอัปเดตแบบ optimistic ไว้ ค่าจริงหลังเซฟคือค่านี้
      window.dispatchEvent(new CustomEvent('posts:changed', { detail: { id, category: data.data.post.category ?? null } }))
    } catch {
      setSaveState('idle')
      setSaveError('บันทึกไม่สำเร็จ (เน็ตมีปัญหา?) — กำลังลองใหม่')
      scheduleRetry()
    }
  }

  // แทรกอิโมจิที่ตำแหน่ง cursor ปัจจุบัน — ไม่ต่อท้ายเฉยๆ เพราะคนมักแทรกกลางประโยคที่พิมพ์ค้างไว้
  function insertEmoji(emoji) {
    const el = bodyRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    setBody(body.slice(0, start) + emoji + body.slice(end))
    // ต้องรอ React commit ค่าใหม่ลง textarea ก่อน ไม่งั้น setSelectionRange ยิงใส่ค่าเก่า
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + emoji.length
      el.setSelectionRange(pos, pos)
      autoGrow(el)
    })
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
    if (!body.trim()) { setAiError('ยังไม่มีเนื้อหา — เขียนก่อนแล้วค่อยขอโควต/หัวข้อ'); return }
    setSuggesting(true)
    setAiError('')
    try {
      const res = await fetch('/api/posts/ai/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: id, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAiError(data.error || 'ขอโควต/หัวข้อไม่สำเร็จ'); return }
      // ต่อท้ายชุดใหม่ไว้บนสุด ไม่ทับของเก่า · `saved` = แถวจริงใน DB (null ถ้า insert ล้ม — ยังโชว์ให้ดูได้)
      const fresh = data.data.saved || {
        id: `tmp-${Date.now()}`,
        payload: {
          quotes: data.data.quotes,
          headlines: data.data.headlines,
          imageIdeas: data.data.imageIdeas,
          hashtags: data.data.hashtags,
          cta: data.data.cta,
          articleTips: data.data.articleTips,
        },
        created_at: new Date().toISOString(),
      }
      setSuggestCollapsed(false)
      setSuggestions(prev => [fresh, ...prev])
    } catch {
      setAiError('ขอโควต/หัวข้อไม่สำเร็จ')
    } finally {
      setSuggesting(false)
    }
  }

  // AI ตรวจเนื้อหาก่อนเผยแพร่ — ผลเก็บใน post_ai_suggestions kind='review' เหมือน caption
  // ⛔ ไม่แตะสถานะโพสต์เลย · ผลตรวจเป็นข้อมูลให้บรรณาธิการอ่าน คนกดอนุมัติยังเป็นคนเหมือนเดิม
  async function handleReview() {
    if (!body.trim()) { setAiError('ยังไม่มีเนื้อหา — เขียนก่อนแล้วค่อยให้ AI ตรวจ'); return }
    setReviewing(true)
    setAiError('')
    try {
      const res = await fetch('/api/posts/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: id, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAiError(data.error || 'ตรวจเนื้อหาไม่สำเร็จ'); return }
      // `saved` = แถวจริงใน DB (null ถ้า insert ล้ม — ยังโชว์ผลให้ดูได้ ไม่เสียโควตาฟรี)
      const fresh = data.data.saved || {
        id: `tmp-${Date.now()}`,
        kind: 'review',
        payload: { risks: data.data.risks, counts: data.data.counts, reviewedAt: data.data.reviewedAt },
        created_at: new Date().toISOString(),
      }
      setSuggestCollapsed(false)
      setSuggestions(prev => [fresh, ...prev])
    } catch {
      setAiError('ตรวจเนื้อหาไม่สำเร็จ')
    } finally {
      setReviewing(false)
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
          // back() แทน push('/posts') ตรงๆ — กลับไปที่ query string เดิม (filter/สถานะที่เลือกไว้)
          // ไม่มีประวัติในแท็บ (เช่น เปิดลิงก์ตรงมา) → fallback ไป /posts เฉยๆ
          if (res.ok) window.history.length > 1 ? router.back() : router.push('/posts')
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
    if (aiMode === 'review') return handleReview()
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
  const aiBusy = aiLoading || polishing || suggesting || reviewing

  return (
    <div className="flex flex-col gap-3">
      {/* ใครเพิ่งแตะโพสต์นี้ — ให้เห็นก่อนพิมพ์ ไม่ใช่ไปรู้ตอนชน 409 (ที่มาของค่า: /api/posts/[id]/pulse) */}
      {liveEditor && !remoteEdit && (
        <p className="text-sm text-warm-700 dark:text-disc-text flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          {liveEditor.name} เพิ่งแก้โพสต์นี้เมื่อครู่ — ระวังแก้ชนกัน
        </p>
      )}

      {/* ของเราค้างอยู่ + ฝั่งโน้นขยับไปแล้ว = จะชนแน่ตอน autosave รอบหน้า บอกไว้ก่อนจะได้ไม่ตกใจ */}
      {remoteEdit && (
        <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2">
          {remoteEdit.name ? `${remoteEdit.name} แก้โพสต์นี้ไปแล้ว` : 'มีคนแก้โพสต์นี้ไปแล้ว'}
          ระหว่างที่คุณยังพิมพ์ค้างอยู่ — ตอนบันทึก ระบบจะถามก่อนว่าจะเก็บฉบับของคุณไว้ยังไง ไม่มีใครถูกทับเงียบๆ
        </p>
      )}

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

        {saveError && <span className="text-sm text-red-500">{saveError}</span>}

        {can.edit && <EmojiPicker onPick={insertEmoji} />}

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
              title={aiMode === 'draft' ? 'เขียนใหม่ทั้งก้อน (ทับของเดิม)' : aiMode === 'caption' ? 'เสนอโควต/หัวข้อ/ไอเดียภาพ ไม่แตะเนื้อหา' : 'ขัดภาษาของที่มีอยู่ ไม่เพิ่มประเด็นใหม่'}
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

              {sg.kind === 'review' ? (
                <ReviewResult
                  payload={sg.payload}
                  /* เนื้อหาถูกแก้หลังตรวจไหม — autosave setPost ทุกครั้ง post.updated_at จึงสดเสมอ
                     pendingSave = พิมพ์แล้วแต่ debounce ยังไม่ยิง ก็ถือว่าเนื้อหาเปลี่ยนแล้วเหมือนกัน
                     over-report ได้ (แก้หมวดก็ bump updated_at) แต่เตือนเกินปลอดภัยกว่าเตือนขาด */
                  stale={
                    !!sg.payload?.reviewedAt &&
                    (pendingSave || new Date(post.updated_at) > new Date(sg.payload.reviewedAt))
                  }
                />
              ) : [
                { label: '💬 โควต', items: sg.payload?.quotes },
                { label: '📰 หัวข้อ', items: sg.payload?.headlines },
                { label: '📸 ไอเดียภาพประกอบ', items: sg.payload?.imageIdeas },
                // hashtags มาเป็น array ของคำแยกๆ — รวมเป็นบรรทัดเดียวคั่นด้วยช่องว่างก่อนโชว์ (แปะใช้ทีเดียวได้เลย ไม่ต้องคัดลอกทีละคำ)
                { label: '📌 Hashtag แนะนำ', items: sg.payload?.hashtags?.length ? [sg.payload.hashtags.join(' ')] : [] },
                { label: '📝 คำแนะนำสำหรับบทความ', items: sg.payload?.articleTips },
              ].map(({ label, items }) => (items || []).length > 0 && (() => {
                const catKey = `${sg.id}:${label}`
                const catOpen = !!openCat[catKey]
                return (
                  <div key={label} className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setOpenCat(prev => ({ ...prev, [catKey]: !prev[catKey] }))}
                      className="flex items-center justify-between gap-2 text-sm text-warm-700 dark:text-disc-text hover:opacity-80"
                    >
                      <span>{label} ({items.length})</span>
                      {catOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {catOpen && items.map((s, i) => (
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
                )
              })())}
            </div>
          ))}
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
