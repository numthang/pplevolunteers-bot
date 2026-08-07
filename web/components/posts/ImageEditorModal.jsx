'use client'

// แก้ไขรูปของโพสต์ — ครอบตัด · หมุน · เบลอ/พิกเซลทับหน้าคน
//
// ทำงานในเบราว์เซอร์ล้วน (canvas) แล้วส่งไฟล์ที่ได้ไปทับไฟล์เดิมผ่าน PUT /api/posts/media/[id]
// → แถวสื่อ id เดิม ตำแหน่งเดิม (sort_order ไม่ขยับ) คนที่กำลังดูโพสต์อยู่ไม่เห็นรูปสลับที่
//
// ⚠️ ต้องมี `path` (ไฟล์อยู่บนดิสก์เราแล้ว) ถึงจะแก้ได้ — รูปที่ยัง fallback ไป CDN ของ Discord
//    เป็น cross-origin จะทำให้ canvas โดน taint แล้ว toBlob() โยน SecurityError (ปุ่มจึงถูกซ่อนไว้)
//
// ⚠️ เครื่องมือเบลอตั้งใจให้ "ทับจริงบนพิกเซล" ไม่ใช่ overlay — เซฟแล้วกู้หน้าคนกลับไม่ได้
//    (ฝั่ง server ก็ล้าง source_url ทิ้งด้วย ไม่งั้นไฟล์หายเมื่อไหร่จะตกไปโชว์ต้นฉบับที่ยังไม่เบลอ)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, Crop, Droplets, RotateCw, Undo2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

// รูปจากมือถือ 12MP เอามาทำ undo stack ในแท็บเดียวไม่ไหว และโซเชียลก็ย่อเหลือ ~2K อยู่ดี
const MAX_SIDE = 2048
const UNDO_LIMIT = 5

const ASPECTS = [
  { key: 'free', value: null },
  { key: 'a1x1', value: 1 },
  { key: 'a4x5', value: 4 / 5 },
  { key: 'a16x9', value: 16 / 9 },
]

const TOOL_BTN = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition'
const TOOL_ON = 'border-teal text-teal bg-teal/10'
const TOOL_OFF = 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'

// `onNavigate(dir)` = พลิกไปรูปก่อนหน้า/ถัดไป (ไม่ส่งมา = ไม่มีปุ่มพลิก)
// ฝั่งเรียกต้องใส่ `key={media.id}` ให้ modal นี้ด้วย — พลิกรูปแล้ว canvas/undo stack ต้องเริ่มใหม่หมด
export default function ImageEditorModal({ media, src, onClose, onSaved, onNavigate }) {
  const t = useTranslations('posts.imageEditor')
  const canvasRef = useRef(null)
  const undoRef = useRef([])          // canvas สำเนา — ย้อนได้ UNDO_LIMIT ขั้น
  const dragRef = useRef(null)        // จุดเริ่มลาก (พิกัดในหน่วยพิกเซลของ canvas)

  const [ready, setReady] = useState(false)
  const [tool, setTool] = useState('mask')      // 'mask' = เบลอ/พิกเซล · 'crop' = ครอบตัด
  const [mask, setMask] = useState('pixel')     // 'pixel' | 'blur'
  const [aspect, setAspect] = useState(null)
  const [sel, setSel] = useState(null)          // กรอบที่เลือกอยู่ (หน่วยพิกเซลของ canvas)
  const [steps, setSteps] = useState(0)         // จำนวนครั้งที่แก้ — คุมปุ่มย้อนกลับ/เตือนตอนปิด
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── โหลดรูปลง canvas ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (!alive || !canvasRef.current) return
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
      const c = canvasRef.current
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      setReady(true)
    }
    img.onerror = () => setError(t('loadFailed'))
    img.src = src
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // ปิดได้ 3 ทาง (กฎ CLAUDE.md): ปุ่ม X · ESC · คลิกพื้นหลัง — แก้ค้างอยู่ต้องถามก่อนทิ้ง
  function requestClose() {
    if (steps > 0 && !confirm(t('confirmDiscard'))) return
    onClose()
  }
  // พลิกรูป = ทิ้งงานที่ยังไม่เซฟเหมือนปิดกล่อง → ถามก่อนเสมอ
  function go(dir) {
    if (steps > 0 && !confirm(t('confirmDiscard'))) return
    onNavigate(dir)
  }
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── undo ────────────────────────────────────────────────────────────────────
  function pushUndo() {
    const c = canvasRef.current
    const copy = document.createElement('canvas')
    copy.width = c.width
    copy.height = c.height
    copy.getContext('2d').drawImage(c, 0, 0)
    undoRef.current.push(copy)
    if (undoRef.current.length > UNDO_LIMIT) undoRef.current.shift()
    setSteps(s => s + 1)
  }
  function undo() {
    const prev = undoRef.current.pop()
    if (!prev) return
    const c = canvasRef.current
    c.width = prev.width           // ครอบตัด/หมุนเปลี่ยนขนาด canvas ด้วย ต้องคืนขนาดเดิม
    c.height = prev.height
    c.getContext('2d').drawImage(prev, 0, 0)
    setSel(null)
    setSteps(s => Math.max(0, s - 1))
  }

  // ── ลากเลือกกรอบ ────────────────────────────────────────────────────────────
  function pointOf(e) {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(c.width, (e.clientX - r.left) * c.width / r.width)),
      y: Math.max(0, Math.min(c.height, (e.clientY - r.top) * c.height / r.height)),
    }
  }
  function rectOf(a, b) {
    const c = canvasRef.current
    let w = Math.abs(b.x - a.x)
    let h = Math.abs(b.y - a.y)
    if (tool === 'crop' && aspect) h = w / aspect      // ล็อกสัดส่วนเฉพาะตอนครอบตัด
    let x = b.x < a.x ? a.x - w : a.x
    let y = b.y < a.y ? a.y - h : a.y
    x = Math.max(0, Math.min(x, c.width))
    y = Math.max(0, Math.min(y, c.height))
    return { x, y, w: Math.min(w, c.width - x), h: Math.min(h, c.height - y) }
  }
  function onDown(e) {
    if (!ready) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = pointOf(e)
    setSel(null)
  }
  function onMove(e) {
    if (!dragRef.current) return
    setSel(rectOf(dragRef.current, pointOf(e)))
  }
  function onUp() {
    if (!dragRef.current) return
    dragRef.current = null
    setSel(s => (s && s.w > 4 && s.h > 4 ? s : null))
  }

  // ── เครื่องมือ ──────────────────────────────────────────────────────────────
  function applyMask() {
    if (!sel) return
    pushUndo()
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const r = { x: Math.round(sel.x), y: Math.round(sel.y), w: Math.round(sel.w), h: Math.round(sel.h) }
    if (mask === 'pixel') {
      // ย่อแล้วขยายกลับแบบไม่ smooth = พิกเซลแตก · กู้กลับไม่ได้จริง (ต่างจากเบลอที่ยัง "เดา" ได้บ้าง)
      const block = Math.max(4, Math.round(Math.min(r.w, r.h) / 8))
      const tmp = document.createElement('canvas')
      tmp.width = Math.max(1, Math.round(r.w / block))
      tmp.height = Math.max(1, Math.round(r.h / block))
      tmp.getContext('2d').drawImage(c, r.x, r.y, r.w, r.h, 0, 0, tmp.width, tmp.height)
      ctx.save()
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, r.x, r.y, r.w, r.h)
      ctx.restore()
    } else {
      // วาด canvas ทับตัวเองโดยเปิด filter blur แล้ว clip ไว้เฉพาะกรอบ
      const radius = Math.max(6, Math.round(Math.min(r.w, r.h) / 6))
      ctx.save()
      ctx.beginPath()
      ctx.rect(r.x, r.y, r.w, r.h)
      ctx.clip()
      ctx.filter = `blur(${radius}px)`
      ctx.drawImage(c, 0, 0)
      ctx.restore()
    }
    setSel(null)
  }

  function applyCrop() {
    if (!sel) return
    pushUndo()
    const c = canvasRef.current
    const r = { x: Math.round(sel.x), y: Math.round(sel.y), w: Math.round(sel.w), h: Math.round(sel.h) }
    const tmp = document.createElement('canvas')
    tmp.width = r.w
    tmp.height = r.h
    tmp.getContext('2d').drawImage(c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h)
    c.width = r.w
    c.height = r.h
    c.getContext('2d').drawImage(tmp, 0, 0)
    setSel(null)
  }

  function rotate() {
    pushUndo()
    const c = canvasRef.current
    const tmp = document.createElement('canvas')
    tmp.width = c.width
    tmp.height = c.height
    tmp.getContext('2d').drawImage(c, 0, 0)
    c.width = tmp.height
    c.height = tmp.width
    const ctx = c.getContext('2d')
    ctx.translate(c.width / 2, c.height / 2)
    ctx.rotate(Math.PI / 2)
    ctx.drawImage(tmp, -tmp.width / 2, -tmp.height / 2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    setSel(null)
  }

  // ── บันทึก ──────────────────────────────────────────────────────────────────
  async function save() {
    if (saving || !steps) return
    setSaving(true)
    setError('')
    try {
      const isPng = /\.png$/i.test(media.path || '')
      const type = isPng ? 'image/png' : 'image/jpeg'
      const blob = await new Promise(res => canvasRef.current.toBlob(res, type, 0.92))
      if (!blob) { setError(t('saveFailed')); return }
      const form = new FormData()
      form.append('file', blob, isPng ? 'edited.png' : 'edited.jpg')
      const res = await fetch(`/api/posts/media/${media.id}`, { method: 'PUT', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('saveFailed')); return }
      onSaved(data.data)
      onClose()
    } catch {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const c = canvasRef.current
  const box = sel && c
    ? { left: `${sel.x / c.width * 100}%`, top: `${sel.y / c.height * 100}%`,
        width: `${sel.w / c.width * 100}%`, height: `${sel.h / c.height * 100}%` }
    : null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-disc-border shrink-0">
          <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('title')}</h2>
          <button
            type="button" onClick={requestClose} title={t('closeTitle')}
            className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setTool('mask'); setSel(null) }} className={`${TOOL_BTN} ${tool === 'mask' ? TOOL_ON : TOOL_OFF}`}>
              <Droplets size={14} /> {t('toolMask')}
            </button>
            <button type="button" onClick={() => { setTool('crop'); setSel(null) }} className={`${TOOL_BTN} ${tool === 'crop' ? TOOL_ON : TOOL_OFF}`}>
              <Crop size={14} /> {t('toolCrop')}
            </button>
            <button type="button" onClick={rotate} disabled={!ready} className={`${TOOL_BTN} ${TOOL_OFF} disabled:opacity-40`}>
              <RotateCw size={14} /> {t('toolRotate')}
            </button>
            <button type="button" onClick={undo} disabled={!steps} className={`${TOOL_BTN} ${TOOL_OFF} disabled:opacity-40 ml-auto`}>
              <Undo2 size={14} /> {t('undo')}
            </button>
          </div>

          {/* ตัวเลือกย่อยของเครื่องมือที่เลือกอยู่ */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {tool === 'mask' ? (
              <>
                <span className="text-warm-500 dark:text-disc-muted">{t('maskStyle')}</span>
                {['pixel', 'blur'].map(m => (
                  <button
                    key={m} type="button" onClick={() => setMask(m)}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition ${mask === m ? TOOL_ON : TOOL_OFF}`}
                  >
                    {t(m === 'pixel' ? 'maskPixel' : 'maskBlur')}
                  </button>
                ))}
              </>
            ) : (
              <>
                <span className="text-warm-500 dark:text-disc-muted">{t('cropRatio')}</span>
                {ASPECTS.map(a => (
                  <button
                    key={a.key} type="button" onClick={() => { setAspect(a.value); setSel(null) }}
                    className={`px-2.5 py-1 rounded-lg border text-xs transition ${aspect === a.value ? TOOL_ON : TOOL_OFF}`}
                  >
                    {t(a.key)}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* กล่องนี้แทน lightbox ไปแล้ว (จิ้มรูปในกริด = มาที่นี่เลย) → ต้องพลิกดูรูปอื่นได้เหมือนกัน
              ปุ่มพลิกอยู่ **นอก** ชั้นรับการลาก จึงไม่ชนกับการลากกรอบ */}
          <div className="flex items-center justify-center gap-2 bg-black rounded-lg p-2">
            {onNavigate && (
              <button
                type="button" onClick={() => go(-1)} title={t('prev')}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <div className="relative inline-block max-w-full">
              <canvas ref={canvasRef} className="block max-w-full max-h-[62vh] w-auto h-auto" />
              {/* ชั้นรับการลาก — touch-none = ลากบนมือถือแล้วหน้าจอไม่เลื่อนตาม */}
              <div
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="absolute inset-0 touch-none cursor-crosshair"
              >
                {box && (
                  <div
                    style={box}
                    className={`absolute border-2 ${tool === 'crop' ? 'border-teal bg-white/10' : 'border-orange bg-orange/20'}`}
                  />
                )}
              </div>
            </div>
            {onNavigate && (
              <button
                type="button" onClick={() => go(1)} title={t('next')}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>

          <p className="text-sm text-warm-500 dark:text-disc-muted">
            {tool === 'mask' ? t('hintMask') : t('hintCrop')}
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border shrink-0">
          {sel && (
            <button
              type="button"
              onClick={tool === 'crop' ? applyCrop : applyMask}
              className="px-3 py-2 text-sm rounded-lg bg-teal text-white hover:opacity-90 transition mr-auto"
            >
              {tool === 'crop' ? t('applyCrop') : t('applyMask')}
            </button>
          )}
          <button
            type="button" onClick={requestClose}
            className="px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            {t('cancel')}
          </button>
          <button
            type="button" onClick={save} disabled={saving || !steps}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
