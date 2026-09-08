'use client'

// เครื่องช่วยอ่านบทพูด (teleprompter) — ตั้งมือถืออัด แล้วอ่านบทจากจอนี้ให้จบในเทคเดียว
//
// ที่มา (2026-09-08): เจ้าของงานตัดต่อไม่เป็นและไม่ชอบทำคลิป → ทางที่ถูกที่สุดคือ **ไม่ต้องตัดต่อเลย**
// ถ้ามีบทให้อ่านแล้วได้เทคเดียวที่ใช้ได้ ก็ไม่มีอะไรให้ตัด · ขั้นถัดไป (ถอดเสียง/ใส่ซับ/ตัดด้วยข้อความ)
// ล้วนมีไว้แก้ปัญหาของคนที่พูดแล้วต้องมาตัดทีหลัง ซึ่งอาจไม่เกิดขึ้นเลย
//
// เก็บบทไว้ที่ post_episodes.bodies->>'script' — คอลัมน์ jsonb ที่มีอยู่แล้ว **ไม่มี migration**
// ⚠️ ต้อง merge ของเดิมใน bodies เสมอ (เขียนทับทั้งก้อน = คีย์อื่นหายเงียบๆ)
//
// ⛔ ห้ามมีปุ่ม "บันทึก" — หน้า Update ที่มี autosave ห้ามมี (กฎ 2026-07-30 เย็น)
//    ที่ต้องมีแทนคือป้ายสถานะ + beforeunload ตอนยังเซฟไม่เสร็จ
//
// ── โหมดอัดคลิป (2026-09-08 · จากทดสอบจริง) ────────────────────────────────
// แอปกล้องแยกมี 2 ปัญหา: (1) ตาต้องเหลือบไปมาระหว่างเลนส์กับจอบท (2) สลับแอปแล้วกล้องหยุดอัด
// ทางแก้คืออัดในหน้านี้เลยด้วย getUserMedia+MediaRecorder — ซ้อนบทติดขอบบนสุดใกล้เลนส์
// และไม่ต้องสลับแอปอีกต่อไป ผ่าน /scrutinize แล้วพบ 2 จุดสำคัญที่แก้ไว้ในนี้:
//   - คลิปอยู่ใน RAM ของหน้าเว็บเท่านั้นจนกว่าจะกดส่ง (ต่างจากแอปกล้องที่เซฟลงเครื่องอัตโนมัติ)
//     → ต้องมีขั้น "ดูตัวอย่างก่อนส่ง" ผู้ใช้ตัดสินใจเอง + beforeunload กันปิดหน้าเผลอ
//   - โพสต์แนบคลิปได้ทีละ 1 ชิ้น (MAX_VIDEO_PER_EPISODE) → อัดซ้ำต้องลบของเก่าก่อนส่งใหม่อัตโนมัติ
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, Check, Play, Pause, RotateCcw, Pencil, Eye, Minus, Plus, ArrowLeft,
  Video, Circle, Square, X,
} from 'lucide-react'

const SAVE_DEBOUNCE_MS = 800

// ความเร็วเลื่อน = พิกเซลต่อวินาที · ขนาดตัวอักษร = พิกเซล
const SPEED = { min: 8, max: 90, step: 4, def: 28 }
const FONT = { min: 20, max: 96, step: 4, def: 40 }
const COUNTDOWN_SECONDS = 3

// เพดานเวลาอัด — 120 วิ ที่ 4Mbps วิดีโอ + 128kbps เสียง ≈ 62MB ยังเหลือมาร์จิ้นเยอะจากเพดานเซิร์ฟเวอร์ 200MB
// (ตั้ง bitrate เองแทนค่า default ของเบราว์เซอร์ เพราะ default มักสูงเกินจนไฟล์ใหญ่โดยไม่รู้ตัว)
const MAX_RECORD_SECONDS = 120
const VIDEO_BITS_PER_SEC = 4_000_000
const AUDIO_BITS_PER_SEC = 128_000

// ลำดับสำคัญ — mp4 มาก่อนเพราะ Safari รุ่นใหม่รองรับแต่ไม่รองรับ webm
const RECORD_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  return RECORD_MIME_CANDIDATES.find(m => {
    try { return MediaRecorder.isTypeSupported(m) } catch { return false }
  }) || ''
}

const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const BTN_BASE = 'flex items-center gap-1.5 px-4 py-2 text-base font-medium rounded-lg transition'
const BTN_OUTLINE = `${BTN_BASE} border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover`
const BTN_PRIMARY = `${BTN_BASE} bg-teal text-white hover:opacity-90`

/**
 * ยืดกล่องข้อความตามเนื้อหา (ลอกจาก PostEditor.jsx)
 * ⚠️ forced reflow — เรียกได้ครั้งเดียวต่อ render ห้ามเรียกซ้ำใน onChange
 */
function autoGrow(el) {
  if (!el) return
  const scrollY = window.scrollY
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
  if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: 'instant' })
}
const useAutoGrowEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function ScriptTeleprompter({ id }) {
  const t = useTranslations('posts.script')
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [title, setTitle] = useState('')
  const [script, setScript] = useState('')
  const [canEdit, setCanEdit] = useState(false)
  const [existingVideo, setExistingVideo] = useState(null)

  const [editing, setEditing] = useState(false)
  const [running, setRunning] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [speed, setSpeed] = useState(SPEED.def)
  const [fontSize, setFontSize] = useState(FONT.def)

  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)

  // ─── โหมดอัดคลิป ───────────────────────────────────────────────
  const [recordSupported, setRecordSupported] = useState(false)
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordPhase, setRecordPhase] = useState('camera') // camera | recording | preview | uploading | done
  const [camReady, setCamReady] = useState(false)
  const [camError, setCamError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadError, setUploadError] = useState('')

  const camVideoRef = useRef(null)
  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const blobRef = useRef(null)
  const blobMimeRef = useRef('')   // ชนิดไฟล์ที่ MediaRecorder เลือกไว้จริง — ห้ามเดาจาก blob.type ตอนอัป
  const inTakeRef = useRef(false)  // อยู่ในโหมดอัด (จ่อกล้อง/กำลังอัด) ไหม — ใช้ในลูปเลื่อนโดยไม่ต้อง restart ลูป
  const elapsedTimerRef = useRef(null)

  const lockTokenRef = useRef(null)
  const bodiesRef = useRef(null)      // ของเดิมทั้งก้อน — ต้อง merge ก่อนเขียนกลับ
  const savedRef = useRef('')         // ค่าที่ลง DB แล้ว (ใช้เทียบว่ามีของค้างไหม)
  const loadedRef = useRef(false)
  const blockedRef = useRef(false)
  const saveTimer = useRef(null)
  const scrollRef = useRef(null)
  const textRef = useRef(null)

  const dirty = script !== savedRef.current

  // ─── โหลด ───────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/posts/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(data.error || t('loadFailed')); return }
      const p = data.data.post
      lockTokenRef.current = p.lock_token
      bodiesRef.current = p.bodies || {}
      const s = typeof bodiesRef.current.script === 'string' ? bodiesRef.current.script : ''
      setTitle(p.title || '')
      setScript(s)
      savedRef.current = s
      setCanEdit(!!data.data.can?.edit)
      setExistingVideo((data.data.media || []).find(m => m.kind === 'video') || null)
      setLoadError('')
      loadedRef.current = true
      blockedRef.current = false
      setConflict(false)
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { load() }, [load])
  useAutoGrowEffect(() => { if (editing) autoGrow(textRef.current) }, [editing, script])
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // เบราว์เซอร์/เครื่องนี้อัดคลิปในหน้าเว็บได้ไหม — ไม่รองรับก็ซ่อนปุ่มไปเลย เหลือแค่โหมดอ่านเดิม
  useEffect(() => {
    const ok = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia &&
      typeof window !== 'undefined' && !!window.MediaRecorder && !!pickRecorderMime()
    setRecordSupported(ok)
  }, [])

  useEffect(() => {
    inTakeRef.current = recordOpen && (recordPhase === 'camera' || recordPhase === 'recording')
  }, [recordOpen, recordPhase])

  // เผื่อ unmount ระหว่างเปิดกล้องอยู่ (เช่นกดกลับของเบราว์เซอร์) — ปิดกล้องทิ้งเสมอ
  useEffect(() => () => { streamRef.current?.getTracks().forEach(tr => tr.stop()) }, [])

  // ─── autosave (เฉพาะบทพูด) ──────────────────────────────────────
  const save = useCallback(async () => {
    if (blockedRef.current || !loadedRef.current || !lockTokenRef.current) return
    const sent = script
    setSaveState('saving')
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lockToken: lockTokenRef.current,
          bodies: { ...(bodiesRef.current || {}), script: sent },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.conflict) {
        blockedRef.current = true
        setConflict(true)
        setSaveState('idle')
        return
      }
      if (!res.ok) {
        setSaveState('idle')
        setSaveError(data.error || t('saveFailed'))
        return
      }
      lockTokenRef.current = data.data.post.lock_token
      bodiesRef.current = data.data.post.bodies || {}
      savedRef.current = sent
      setSaveError('')
      setSaveState('saved')
      setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
    } catch {
      setSaveState('idle')
      setSaveError(t('saveFailed'))
    }
  }, [id, script, t])

  useEffect(() => {
    if (!loadedRef.current || !canEdit || blockedRef.current) return
    if (script === savedRef.current) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(saveTimer.current)
  }, [script, canEdit, save])

  // เตือนก่อนปิดแท็บถ้ายังเซฟบทไม่เสร็จ **หรือ** มีคลิปที่อัดแล้วแต่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์
  // (คลิปอยู่ใน RAM ของหน้าเว็บเท่านั้น — ปิดแท็บ = หายเกลี้ยง ต่างจากแอปกล้องที่เซฟลงเครื่องอัตโนมัติ)
  useEffect(() => {
    const hasUnsentClip = recordOpen && ['recording', 'preview', 'uploading'].includes(recordPhase)
    if (!dirty && saveState !== 'saving' && !hasUnsentClip) return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, saveState, recordOpen, recordPhase])

  // ─── เลื่อนอัตโนมัติ ────────────────────────────────────────────
  // rAF + สะสมเศษพิกเซล — ถ้าปัดเป็นจำนวนเต็มทุกเฟรม ความเร็วต่ำๆ จะไม่ขยับเลย
  // ใช้ร่วมกันทั้งโหมดอ่านเฉยๆ และโหมดอัดคลิป — มีแค่กล่องเดียวถูก mount ที่ scrollRef ต่อครั้ง
  useEffect(() => {
    if (!running || countdown > 0) return
    let raf = 0
    let last = performance.now()
    let carry = 0
    const tick = now => {
      const el = scrollRef.current
      if (el) {
        carry += (speed * (now - last)) / 1000
        const whole = Math.floor(carry)
        if (whole > 0) {
          carry -= whole
          el.scrollTop += whole
          // ⛔ ถึงท้ายบทแล้ว **ห้ามหยุดเทค** — bug จริง 2026-09-08: user อัดแล้วคลิปตัดจบ
          //    ก่อนพูดจบ เพราะตอนเลื่อนสุด ข้อความท้ายบทยังค้างบนจอให้อ่านอีกเกือบเต็มกล่อง
          //    (ยิ่งบทสั้นจนกล่องไม่ล้น ยิ่งจบทันทีที่เริ่ม) · โหมดอ่านเฉยๆ หยุดเองได้ตามเดิม
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && !inTakeRef.current) setRunning(false)
        }
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, countdown])

  // นับถอยหลังก่อนเริ่มเลื่อน — ให้เวลาขยับไปหน้ากล้อง
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const start = useCallback(() => { setCountdown(COUNTDOWN_SECONDS); setRunning(true) }, [])
  const stop = useCallback(() => { setRunning(false); setCountdown(0) }, [])
  const toTop = useCallback(() => {
    stop()
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [stop])

  // เว้นวรรค = เล่น/หยุด · ปิดไว้ตอนแก้บท ไม่งั้นพิมพ์เว้นวรรคไม่ได้
  // ตอนอยู่โหมดอัดคลิป ปุ่มเดียวกันนี้แหละที่เริ่ม/จบเทค (ดูเอฟเฟกต์ผูก MediaRecorder ด้านล่าง)
  // แต่ใช้ได้เฉพาะช่วง "กำลังจ่อกล้อง" กับ "กำลังอัด" — ตอนดูตัวอย่าง/กำลังส่งไม่ให้กดเผลอ
  useEffect(() => {
    if (editing) return
    const onKey = e => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (recordOpen && recordPhase !== 'camera' && recordPhase !== 'recording') return
      if (e.code === 'Space') { e.preventDefault(); running || countdown > 0 ? stop() : start() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSpeed(s => Math.min(SPEED.max, s + SPEED.step)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSpeed(s => Math.max(SPEED.min, s - SPEED.step)) }
      else if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, running, countdown, start, stop, recordOpen, recordPhase])

  // ─── โหมดอัดคลิป ───────────────────────────────────────────────
  const openRecord = useCallback(async () => {
    setCamError('')
    setUploadError('')
    setRecordOpen(true)
    setRecordPhase('camera')
    setCamReady(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      })
      streamRef.current = stream
      if (camVideoRef.current) camVideoRef.current.srcObject = stream
      setCamReady(true)
    } catch {
      setCamError(t('cameraDenied'))
    }
  }, [t])

  const closeRecord = useCallback(() => {
    stop()
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
    recorderRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    blobRef.current = null
    chunksRef.current = []
    setCamReady(false)
    setCamError('')
    setUploadError('')
    setRecordOpen(false)
    setRecordPhase('camera')
    setElapsed(0)
  }, [stop, previewUrl])

  const retake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    blobRef.current = null
    chunksRef.current = []
    setUploadError('')
    setRecordPhase('camera')
    toTop()
  }, [previewUrl, toTop])

  // เริ่มอัดจริงพร้อมกับตอนบทเริ่มเลื่อน (นับถอยหลังจบ) — ผูกกับ `running` ตัวเดียวกับโหมดอ่าน
  // เพื่อให้ "หยุดเลื่อน" (Space/Esc/เลื่อนจนจบบท) แปลว่า "จบเทค" โดยอัตโนมัติ ไม่ต้องมีปุ่มแยก
  useEffect(() => {
    if (!recordOpen || !camReady || recordPhase !== 'camera') return
    if (!running || countdown > 0 || recorderRef.current) return
    const mime = pickRecorderMime()
    chunksRef.current = []
    let rec
    try {
      rec = new MediaRecorder(streamRef.current, {
        mimeType: mime, videoBitsPerSecond: VIDEO_BITS_PER_SEC, audioBitsPerSecond: AUDIO_BITS_PER_SEC,
      })
    } catch {
      setCamError(t('cameraDenied'))
      stop()
      return
    }
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      // ตัด `;codecs=...` ทิ้ง — เซิร์ฟเวอร์เทียบชนิดไฟล์แบบเป๊ะๆ กับรายการที่รองรับ (isAllowedVideoMime)
      const baseMime = mime.split(';')[0]
      const blob = new Blob(chunksRef.current, { type: baseMime })
      blobMimeRef.current = baseMime
      blobRef.current = blob
      setPreviewUrl(URL.createObjectURL(blob))
      setRecordPhase('preview')
    }
    recorderRef.current = rec
    rec.start()
    setRecordPhase('recording')
    setElapsed(0)
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1
        if (next >= MAX_RECORD_SECONDS) stop()
        return next
      })
    }, 1000)
  }, [running, countdown, recordOpen, camReady, recordPhase, stop, t])

  // running กลับเป็น false ระหว่างที่ยังอัดอยู่ (Space/Esc/เลื่อนจนจบบท/ชนเพดานเวลา) = จบเทค
  useEffect(() => {
    if (recordPhase !== 'recording' || running) return
    clearInterval(elapsedTimerRef.current)
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop()
    recorderRef.current = null
  }, [running, recordPhase])

  // ส่งคลิปขึ้นเซิร์ฟเวอร์ — ใช้ XMLHttpRequest ไม่ใช่ fetch เพราะต้องอ่าน % ระหว่างอัปโหลด
  // (fetch ไม่มี upload progress ที่รองรับข้ามเบราว์เซอร์จริง)
  //
  // ⛔ ห้ามกลับไปลบคลิปเก่าก่อนแล้วค่อยอัปตัวใหม่ — เน็ตมือถือหลุดกลางทาง = เสียทั้งสองทาง
  //    ส่ง `?replace=1` แทน แล้วให้เซิร์ฟเวอร์เขียนไฟล์ใหม่สำเร็จก่อนจึงสลับ+ลบของเก่าในคำขอเดียว
  //    (ส่งธงไปเสมอเมื่อจอบอกว่ามีคลิปเก่า · ฝั่งเซิร์ฟเวอร์หาแถวเองอยู่แล้ว ไม่เจอก็ตกเป็นอัปปกติ)
  const sendClip = useCallback(() => {
    const blob = blobRef.current
    if (!blob) return
    setRecordPhase('uploading')
    setUploadError('')
    setUploadPct(0)
    ;(async () => {
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `/api/posts/${id}/media/video?replace=1`)
          xhr.setRequestHeader('Content-Type', blobMimeRef.current || blob.type || 'video/webm')
          xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100)) }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) return resolve()
            let msg = t('uploadFailed')
            try { msg = JSON.parse(xhr.responseText).error || msg } catch {}
            reject(new Error(msg))
          }
          xhr.onerror = () => reject(new Error(t('uploadFailed')))
          xhr.send(blob)
        })
        setRecordPhase('done')
        setTimeout(() => router.push(`/posts/${id}`), 1200)
      } catch (err) {
        setUploadError(err.message || t('uploadFailed'))
        setRecordPhase('preview')
      }
    })()
  }, [id, router, t])

  const decSpeed = useCallback(() => setSpeed(s => Math.max(SPEED.min, s - SPEED.step)), [])
  const incSpeed = useCallback(() => setSpeed(s => Math.min(SPEED.max, s + SPEED.step)), [])
  const decFont = useCallback(() => setFontSize(f => Math.max(FONT.min, f - FONT.step)), [])
  const incFont = useCallback(() => setFontSize(f => Math.min(FONT.max, f + FONT.step)), [])

  // ─── หน้าจอ ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-base text-warm-500 dark:text-disc-muted">
        <Loader2 size={16} className="animate-spin" /> {t('loading')}
      </p>
    )
  }
  if (loadError) return <p className="text-base text-red-500">{loadError}</p>

  const empty = !script.trim()

  // โหมดอัดคลิป — เต็มจอ ไม่มีหัวข้อ/แถบเมนูของหน้าเดิมกวนสายตา (จงใจแยก return ต่างหาก)
  if (recordOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <video
          ref={camVideoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        <div className="relative z-10 flex items-center justify-between p-3">
          <button
            onClick={closeRecord}
            disabled={recordPhase === 'recording' || recordPhase === 'uploading'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/60 text-white disabled:opacity-40"
          >
            <X size={16} /> {t('backFromRecord')}
          </button>
          {recordPhase === 'recording' && (
            <span className="px-3 py-1.5 rounded-full bg-red-600 text-white text-sm font-medium tabular-nums flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> {fmtTime(elapsed)} / {fmtTime(MAX_RECORD_SECONDS)}
            </span>
          )}
        </div>

        {camError && (
          <div className="relative z-10 mx-4 p-4 rounded-lg bg-red-950/80 text-white text-base">{camError}</div>
        )}

        {/* บทซ้อนติดขอบบนสุด ใกล้เลนส์กล้องหน้าที่สุดเท่าที่ทำได้บนจอเดียว — แก้ปัญหาตาเหลือบ */}
        {(recordPhase === 'camera' || recordPhase === 'recording') && !camError && (
          <div
            ref={scrollRef}
            className="relative z-10 mx-3 mt-1 h-[38vh] overflow-y-auto rounded-lg bg-black/70 text-[#f2f5f8] p-4 leading-relaxed whitespace-pre-wrap break-words"
            style={{ fontSize: `${fontSize}px` }}
          >
            {script}
            {/* หางว่างท้ายบท — ต้องเกือบเท่าความสูงกล่อง (38vh) ไม่งั้นบรรทัดสุดท้ายค้างอยู่ก้นกล่อง
                อ่านไม่ทันตอนเลื่อนหยุด · ของเดิม 20vh สั้นไปจนเป็นส่วนหนึ่งของบั๊ก "อัดจบก่อนพูดจบ" */}
            <div aria-hidden className="h-[32vh]" />
          </div>
        )}

        {countdown > 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
            <span className="text-7xl font-bold text-white tabular-nums">{countdown}</span>
          </div>
        )}

        <div className="relative z-10 mt-auto p-4 flex flex-col items-center gap-3">
          {recordPhase === 'camera' && camReady && (
            <>
              <button
                onClick={start}
                aria-label={t('startRecording')}
                className="h-16 w-16 rounded-full bg-red-600 border-4 border-white flex items-center justify-center"
              >
                <Circle size={22} className="text-white fill-white" />
              </button>
              <div className="flex items-center gap-2">
                <Stepper label={t('speed')} value={speed} onDown={decSpeed} onUp={incSpeed} />
                <Stepper label={t('fontSize')} value={fontSize} onDown={decFont} onUp={incFont} />
              </div>
            </>
          )}

          {recordPhase === 'recording' && (
            <button
              onClick={stop}
              aria-label={t('stopRecording')}
              className="h-16 w-16 rounded-full bg-white flex items-center justify-center"
            >
              <Square size={22} className="text-red-600 fill-red-600" />
            </button>
          )}

          {recordPhase === 'preview' && (
            <div className="w-full flex flex-col gap-3">
              <video src={previewUrl} controls playsInline className="w-full max-h-[50vh] rounded-lg bg-black" />
              {existingVideo && <p className="text-sm text-amber-300">{t('existingVideoNotice')}</p>}
              {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}
              <div className="flex gap-2">
                <button onClick={retake} className={`${BTN_OUTLINE} flex-1 justify-center border-white/40 text-white hover:bg-white/10`}>
                  <RotateCcw size={16} /> {t('retake')}
                </button>
                <button onClick={sendClip} className={`${BTN_PRIMARY} flex-1 justify-center`}>
                  <Check size={16} /> {existingVideo ? t('sendClipReplace') : t('sendClip')}
                </button>
              </div>
            </div>
          )}

          {recordPhase === 'uploading' && (
            <div className="w-full flex flex-col items-center gap-2 text-white">
              <Loader2 size={20} className="animate-spin" />
              <span>{t('uploading', { pct: uploadPct })}</span>
            </div>
          )}

          {recordPhase === 'done' && (
            <div className="flex items-center gap-2 text-white">
              <Check size={20} className="text-green-400" /> {t('uploadSuccess')}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/posts/${id}`} className={`${BTN_OUTLINE} self-start`}>
        <ArrowLeft size={16} /> {t('backToPost')}
      </Link>

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text min-w-0 break-words">
          {title || t('untitled')}
        </h1>
        {saveState !== 'idle' && (
          <span className="text-base text-warm-500 dark:text-disc-muted flex items-center gap-1.5">
            {saveState === 'saving' && <><Loader2 size={16} className="animate-spin" /> {t('saving')}</>}
            {saveState === 'saved' && <><Check size={16} className="text-green-600" /> {t('saved')}</>}
          </span>
        )}
      </div>
      {saveError && <p className="text-base text-red-500">{saveError}</p>}

      {conflict && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-base text-warm-900 dark:text-disc-text">{t('conflict')}</span>
          <button onClick={load} className={BTN_PRIMARY}>{t('reload')}</button>
        </div>
      )}

      {empty ? (
        <div className="rounded-lg border border-dashed border-warm-200 dark:border-disc-border p-8 text-center">
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('emptyHint')}</p>
        </div>
      ) : (
        <>
          {/* แถบควบคุม — มือถือให้ปุ่มหลักเต็มความกว้าง ที่เหลือพับลงบรรทัดถัดไป */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => (running || countdown > 0 ? stop() : start())}
              className={`${BTN_PRIMARY} w-full sm:w-auto justify-center`}
            >
              {running || countdown > 0 ? <><Pause size={16} /> {t('pause')}</> : <><Play size={16} /> {t('play')}</>}
            </button>
            <button onClick={toTop} className={BTN_OUTLINE}>
              <RotateCcw size={16} /> {t('toTop')}
            </button>

            <Stepper label={t('speed')} value={speed} onDown={decSpeed} onUp={incSpeed} />
            <Stepper label={t('fontSize')} value={fontSize} onDown={decFont} onUp={incFont} />

            {canEdit && !editing && recordSupported && (
              <button onClick={openRecord} className={`${BTN_OUTLINE} sm:ml-auto`}>
                <Video size={16} /> {t('recordButton')}
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { stop(); setEditing(e => !e) }}
                className={`${BTN_OUTLINE} ${recordSupported ? '' : 'sm:ml-auto'}`}
              >
                {editing ? <><Eye size={16} /> {t('readMode')}</> : <><Pencil size={16} /> {t('editMode')}</>}
              </button>
            )}
          </div>

          {/* พื้นที่อ่าน — จงใจเป็นพื้นเข้มตัวสว่างทั้งสองธีม เพราะเป็น "จอสำหรับอ่านระยะ 1-2 เมตร"
              ไม่ใช่การ์ดข้อมูล · ขนาดตัวอักษรคุมด้วย inline style (20-96px) จึงอยู่นอก §Type scale
              โดยตั้งใจ — ทั้งหน้าที่ของหน้านี้คือให้ผู้อ่านปรับขนาดเองจนอ่านออกจากที่ที่ยืนอยู่ */}
          {editing ? (
            <textarea
              ref={textRef}
              value={script}
              onChange={e => setScript(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[40vh] resize-none overflow-hidden rounded-lg bg-[#12161c] text-[#f2f5f8] p-4 sm:p-8 leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal"
              style={{ fontSize: `${fontSize}px` }}
            />
          ) : (
            <div className="relative">
              <div
                ref={scrollRef}
                className="h-[60vh] overflow-y-auto rounded-lg bg-[#12161c] text-[#f2f5f8] p-4 sm:p-8 leading-relaxed whitespace-pre-wrap break-words"
                style={{ fontSize: `${fontSize}px` }}
              >
                {script}
                {/* ที่ว่างท้ายบท — ให้บรรทัดสุดท้ายเลื่อนขึ้นมากลางจอได้ ไม่ค้างอยู่ก้นจอ */}
                <div aria-hidden className="h-[40vh]" />
              </div>

              {countdown > 0 && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70">
                  <span className="text-7xl font-bold text-white tabular-nums">{countdown}</span>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-warm-500 dark:text-disc-muted">{t('keysHint')}</p>
        </>
      )}
    </div>
  )
}

function Stepper({ label, value, onDown, onUp }) {
  const btn = 'h-11 w-11 shrink-0 flex items-center justify-center border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition'
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-warm-500 dark:text-disc-muted">{label}</span>
      <div className="flex items-center">
        <button onClick={onDown} className={`${btn} rounded-l-lg`} aria-label={`${label} -`}><Minus size={16} /></button>
        <span className="h-11 min-w-[2.75rem] px-1 flex items-center justify-center text-base tabular-nums border-y border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text">
          {value}
        </span>
        <button onClick={onUp} className={`${btn} rounded-r-lg`} aria-label={`${label} +`}><Plus size={16} /></button>
      </div>
    </div>
  )
}
