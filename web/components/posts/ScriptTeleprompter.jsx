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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Loader2, Check, Play, Pause, RotateCcw, Pencil, Eye, Minus, Plus, ArrowLeft } from 'lucide-react'

const SAVE_DEBOUNCE_MS = 800

// ความเร็วเลื่อน = พิกเซลต่อวินาที · ขนาดตัวอักษร = พิกเซล
const SPEED = { min: 8, max: 90, step: 4, def: 28 }
const FONT = { min: 20, max: 96, step: 4, def: 40 }
const COUNTDOWN_SECONDS = 3

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

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [title, setTitle] = useState('')
  const [script, setScript] = useState('')
  const [canEdit, setCanEdit] = useState(false)

  const [editing, setEditing] = useState(false)
  const [running, setRunning] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [speed, setSpeed] = useState(SPEED.def)
  const [fontSize, setFontSize] = useState(FONT.def)

  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)

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

  // ─── autosave ───────────────────────────────────────────────────
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

  // เตือนก่อนปิดแท็บถ้ายังเซฟไม่เสร็จ (บังคับคู่กับการไม่มีปุ่มบันทึก)
  useEffect(() => {
    if (!dirty && saveState !== 'saving') return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, saveState])

  // ─── เลื่อนอัตโนมัติ ────────────────────────────────────────────
  // rAF + สะสมเศษพิกเซล — ถ้าปัดเป็นจำนวนเต็มทุกเฟรม ความเร็วต่ำๆ จะไม่ขยับเลย
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
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setRunning(false)
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
  useEffect(() => {
    if (editing) return
    const onKey = e => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.code === 'Space') { e.preventDefault(); running || countdown > 0 ? stop() : start() }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSpeed(s => Math.min(SPEED.max, s + SPEED.step)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSpeed(s => Math.max(SPEED.min, s - SPEED.step)) }
      else if (e.key === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, running, countdown, start, stop])

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

            <Stepper
              label={t('speed')}
              value={speed}
              onDown={() => setSpeed(s => Math.max(SPEED.min, s - SPEED.step))}
              onUp={() => setSpeed(s => Math.min(SPEED.max, s + SPEED.step))}
            />
            <Stepper
              label={t('fontSize')}
              value={fontSize}
              onDown={() => setFontSize(f => Math.max(FONT.min, f - FONT.step))}
              onUp={() => setFontSize(f => Math.min(FONT.max, f + FONT.step))}
            />

            {canEdit && (
              <button
                onClick={() => { stop(); setEditing(e => !e) }}
                className={`${BTN_OUTLINE} sm:ml-auto`}
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
