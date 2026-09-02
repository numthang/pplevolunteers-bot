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
import { X, Crop, Droplets, RotateCw, Undo2, Loader2, ChevronLeft, ChevronRight, Wand2, Trash2, Hand } from 'lucide-react'

// รูปจากมือถือ 12MP เอามาทำ undo stack ในแท็บเดียวไม่ไหว และโซเชียลก็ย่อเหลือ ~2K อยู่ดี
const MAX_SIDE = 2048
const UNDO_LIMIT = 5

// ── ซูม/เลื่อนรูป (เคาะ 2026-08-26) ─────────────────────────────────────────────
const ZOOM_MIN = 1
const ZOOM_MAX = 4
const WHEEL_ZOOM_SPEED = 0.0015
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// ── ไม้กายสิทธิ์: ค่าคงที่ของ computeAutoEnhance() ──────────────────────────────
// เกณฑ์เหล่านี้เป็นค่าที่เคาะจากการทดลองเรนเดอร์เทียบ ไม่ใช่สูตรตายตัวจากตำรา —
// ปรับได้ถ้าผลลัพธ์จริงดูจัดไป/จืดไป แต่ต้องคง 2 กลไกป้องกันไว้เสมอ (ดู computeAutoEnhance ด้านล่าง)
const AUTO_LOW_PCT = 0.01, AUTO_HIGH_PCT = 0.99  // percentile ตัดหัว-ท้าย histogram กันหลุดเพราะ hot pixel
const AUTO_MAX_STRETCH = 4        // เพดานยืดคอนทราสต์ — กันรูปมืด/สว่างจัดทั้งใบกลายเป็น noise
const AUTO_TARGET_LUM = 0.47      // ความสว่างเฉลี่ยเป้าหมายหลัง auto-exposure (0-1)
const AUTO_GAMMA_CLAMP = [0.7, 1.4]
const AUTO_SAT_TARGET_CHROMA = 40 // ความจัดสีที่ถือว่า "พอแล้ว" — รูปจัดเกินนี้ไม่ดันเพิ่ม
const AUTO_SAT_MAX_BOOST = 1.25
const AUTO_STRIDE = 4             // สุ่มพิกเซลทุก N ตัวไว้ตั้ง histogram ไม่ต้องไล่ทุกพิกเซล

const ASPECTS = [
  { key: 'free', value: null },
  { key: 'a1x1', value: 1 },
  { key: 'a4x5', value: 4 / 5 },
  { key: 'a16x9', value: 16 / 9 },
]

// ไอคอนล้วน ไม่มีคำบรรยาย (เคาะ 2026-08-26 — เพิ่มปุ่มมือจับแล้วแถวปุ่มรกเกินไป) ใช้ title tooltip แทน
const TOOL_BTN = 'w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border transition'
const TOOL_ON = 'border-teal text-teal bg-teal/10'
const TOOL_OFF = 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'

// `onNavigate(dir)` = พลิกไปรูปก่อนหน้า/ถัดไป (ไม่ส่งมา = ไม่มีปุ่มพลิก)
// ฝั่งเรียกต้องใส่ `key={media.id}` ให้ modal นี้ด้วย — พลิกรูปแล้ว canvas/undo stack ต้องเริ่มใหม่หมด
export default function ImageEditorModal({ media, src, onClose, onSaved, onNavigate, onDelete }) {
  const t = useTranslations('posts.imageEditor')
  const canvasRef = useRef(null)
  const stageRef = useRef(null)       // กรอบ viewport ที่ครอบรูป — ต่อ wheel listener + คลิป overflow ตอนซูม
  const undoRef = useRef([])          // canvas สำเนา — ย้อนได้ UNDO_LIMIT ขั้น
  const dragRef = useRef(null)        // จุดเริ่มลาก (พิกัดในหน่วยพิกเซลของ canvas)
  const pointersRef = useRef(new Map())   // pointerId → {x,y} ที่กดค้างอยู่ตอนนี้ — ไว้แยกลาก 1 นิ้ว (pan) กับบีบ 2 นิ้ว (pinch)
  const panDragRef = useRef(null)     // { startX, startY, startPan } ตอนลาก 1 นิ้ว/เมาส์ในโหมดมือจับ
  const pinchRef = useRef(null)       // { startDist, startZoom, startMid, startPan } ตอนบีบ 2 นิ้ว
  const enhanceBaseRef = useRef(null) // ImageData ต้นฉบับก่อนพรีวิวไม้กายสิทธิ์ (ไว้ blend กลับ + คืนตอนยกเลิก)
  const enhanceFullRef = useRef(null) // ผลไม้กายสิทธิ์เต็ม 100% (คำนวณครั้งเดียวตอนเปิด แล้ว blend ตาม slider)
  const enhanceRafRef = useRef(null)  // คุม requestAnimationFrame กันวาดรัวเกินตอนลาก slider เร็วๆ
  const enhancePrevToolRef = useRef('hand') // เครื่องมือที่อยู่ก่อนกด "ปรับอัตโนมัติ" — commit/cancel แล้วกลับไปที่นี่

  const [ready, setReady] = useState(false)
  // 'hand' = default (เคาะ 2026-08-26) — ลากปกติ = เลื่อนรูป ต้องสลับไป crop/mask ก่อนถึงจะลากเลือกกรอบได้
  // รวม hand ไว้ใน `tool` เดียวกันแทนที่จะแยก state ต่างหาก — กันปุ่ม 2 อันโชว์ ON พร้อมกัน (เจอ 2026-08-26 ตอนมี handMode คู่ tool)
  const [tool, setTool] = useState('hand')      // 'hand' | 'mask' | 'crop' | 'enhance'
  const [mask, setMask] = useState('pixel')     // 'pixel' | 'blur'
  const [aspect, setAspect] = useState(null)
  const [sel, setSel] = useState(null)          // กรอบที่เลือกอยู่ (หน่วยพิกเซลของ canvas)
  const [enhanceStrength, setEnhanceStrength] = useState(100)  // 0-150% ของผลไม้กายสิทธิ์เต็ม
  const [enhancing, setEnhancing] = useState(false)            // พรีวิวไม้กายสิทธิ์ทำงานอยู่ (ยังไม่ apply/cancel)
  const [steps, setSteps] = useState(0)         // จำนวนครั้งที่แก้ — คุมปุ่มย้อนกลับ/เตือนตอนปิด
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)   // แฟลชสั้นๆ "บันทึกแล้ว" — เพราะกล่องไม่ปิดให้เป็นสัญญาณแทน
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

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
    if (enhancing) commitEnhance()   // ปกติ blur ของ slider commit ให้แล้ว เผื่อไว้กรณีปิดผ่าน ESC ที่ไม่ผ่าน blur
    if (steps > 0 && !confirm(t('confirmDiscard'))) return
    onClose()
  }
  // พลิกรูป = ทิ้งงานที่ยังไม่เซฟเหมือนปิดกล่อง → ถามก่อนเสมอ
  function go(dir) {
    if (enhancing) commitEnhance()
    if (steps > 0 && !confirm(t('confirmDiscard'))) return
    onNavigate(dir)
  }
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── ซูม/เลื่อนรูป ────────────────────────────────────────────────────────────
  function resetView() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  // React ผูก onWheel แบบ passive มาตั้งแต่ v17 (กัน scroll หน่วง) → preventDefault() ในนั้นไม่มีผล
  // ต้องผูกเองแบบ passive:false ถึงจะกันหน้าเว็บเลื่อนตอนซูมรูปด้วย scroll
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      setZoom(z => {
        const next = clamp(z - e.deltaY * WHEEL_ZOOM_SPEED, ZOOM_MIN, ZOOM_MAX)
        if (next === ZOOM_MIN) setPan({ x: 0, y: 0 })
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── ลาก 1 นิ้ว/เมาส์ = เลื่อนรูป (เฉพาะโหมดมือจับ) · บีบ 2 นิ้ว = ซูม+เลื่อนพร้อมกัน (ทุกโหมด — ไม่ชนกับการลากเลือกกรอบเพราะใช้ 2 จุดสัมผัส) ──
  function onStageDown(e) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()]
      pinchRef.current = {
        startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        startZoom: zoom,
        startMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
        startPan: pan,
      }
      panDragRef.current = null
      dragRef.current = null   // กันเลือกกรอบค้างจากนิ้วแรกก่อนนิ้วที่สองแตะ
      setSel(null)
    } else if (pointersRef.current.size === 1 && tool === 'hand') {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPan: pan }
    }
  }
  function onStageMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()].slice(0, 2)
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const nextZoom = clamp(pinchRef.current.startZoom * (dist / pinchRef.current.startDist), ZOOM_MIN, ZOOM_MAX)
      setZoom(nextZoom)
      setPan({
        x: pinchRef.current.startPan.x + (mid.x - pinchRef.current.startMid.x),
        y: pinchRef.current.startPan.y + (mid.y - pinchRef.current.startMid.y),
      })
    } else if (panDragRef.current) {
      setPan({
        x: panDragRef.current.startPan.x + (e.clientX - panDragRef.current.startX),
        y: panDragRef.current.startPan.y + (e.clientY - panDragRef.current.startY),
      })
    }
  }
  function onStageUp(e) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 0) panDragRef.current = null
  }

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
    setSaved(false)   // แก้ต่อจากที่เพิ่งเซฟ — เอาแฟลชเก่าออก
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
    resetView()   // ครอบตัด/หมุนเปลี่ยนขนาด canvas มา ซูม/แพนเดิมจะเพี้ยน
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
    resetView()   // ขนาด canvas เปลี่ยน — ซูม/แพนเดิมอ้างอิงกรอบเก่าไม่ได้แล้ว
  }

  // ปกติคลิกปุ่มเครื่องมืออื่นจะ blur slider แล้ว commit ให้เองก่อนแล้ว (ดู onBlur ที่ตัว input)
  // เผื่อไว้เป็น safety net เท่านั้น
  function selectTool(name) {
    if (enhancing) commitEnhance()
    setTool(name)
    setSel(null)
  }

  function rotate() {
    if (enhancing) commitEnhance()
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
    resetView()   // หมุนแล้วขนาด canvas สลับกว้าง/สูง — ซูม/แพนเดิมอ้างอิงกรอบเก่าไม่ได้แล้ว
  }

  // ── ไม้กายสิทธิ์: ปรับสว่าง/คอนทราสต์/ความจัดสีอัตโนมัติจาก histogram ของรูปจริง ─────
  //
  // คำนวณเองจาก pixel data ล้วน ไม่ใช้ AI/API — auto-levels ต่อ channel (แก้ color cast
  // ในตัว) + auto-exposure ด้วย gamma + saturation ที่ดันมากน้อยตามความจัดสีเดิมของรูป
  //
  // มี slider ปรับความแรง (0-150%) แบบ live preview เหมือน crop/mask — ลากดูผลก่อน แล้วกด
  // "ใช้ค่านี้" ถึง commit จริง ไม่ auto-bake ตั้งแต่กดปุ่มแรก (ต่างจากเวอร์ชันแรกที่ทำไว้)
  //
  // ⚠️ saturation ในผลเต็ม 100% ตั้งใจ**ไม่ใช่ค่าคงที่** ต่างจาก CSS filter ธรรมดา — ถ้าดัน
  //    เท่ากันทุกรูป รูปที่จัดอยู่แล้วจะโดนดันจนสีล้น → satFactor แปรผกผันกับความจัดสีปัจจุบัน
  //    (เจอ 2026-08-08 ตอนทดสอบกดซ้ำ — ถ้าคงที่จะเพี้ยนสะสมไม่หยุด)
  //
  // ⚠️ ห้ามลบ 2 guard ใน computeAutoEnhance: (1) range<=0 → identity LUT กัน divide-by-zero
  //    ตอนรูปเป็นสีเรียบ/ครอปจนเหลือพื้นเดียว (2) AUTO_MAX_STRETCH กันรูปมืดสนิท/สว่างจ้าทั้งใบ
  //    ถูกยืดจน noise ระเบิด

  /** คำนวณล้วน ไม่แตะ canvas/state — คืน Uint8ClampedArray RGBA ผลเต็ม 100% ยาวเท่า imageData.data */
  function computeAutoEnhance(imageData) {
    const data = imageData.data

    // รอบสุ่มตัวอย่าง — ตั้ง histogram 3 channel + วัดความจัดสีเฉลี่ยของรูป (ไม่ต้องไล่ทุกพิกเซล
    // เพราะ percentile/chroma เฉลี่ยนิ่งพอแล้วด้วยตัวอย่างหลักหมื่น)
    const histR = new Uint32Array(256), histG = new Uint32Array(256), histB = new Uint32Array(256)
    let chromaSum = 0, sampleCount = 0
    for (let p = 0; p < data.length; p += 4 * AUTO_STRIDE) {
      const r = data[p], g = data[p + 1], b = data[p + 2]
      histR[r]++; histG[g]++; histB[b]++
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      chromaSum += Math.abs(r - lum) + Math.abs(g - lum) + Math.abs(b - lum)
      sampleCount++
    }
    if (!sampleCount) return new Uint8ClampedArray(data)   // canvas ว่าง — คืนสำเนาต้นฉบับเฉยๆ

    const bounds = hist => {
      let cum = 0, low = 0, high = 255
      for (let i = 0; i < 256; i++) { cum += hist[i]; if (cum >= sampleCount * AUTO_LOW_PCT) { low = i; break } }
      cum = 0
      for (let i = 255; i >= 0; i--) { cum += hist[i]; if (cum >= sampleCount * (1 - AUTO_HIGH_PCT)) { high = i; break } }
      return { low, high }
    }

    // LUT คอนทราสต์ต่อ channel — identity ถ้าช่วงแคบเกิน (กัน div/0) · ยืดไม่เกิน AUTO_MAX_STRETCH เท่า
    const contrastLUT = ({ low, high }) => {
      const lut = new Uint8ClampedArray(256)
      const range = high - low
      if (range <= 0) { for (let i = 0; i < 256; i++) lut[i] = i; return lut }
      const ratio = Math.min(255 / range, AUTO_MAX_STRETCH)
      for (let i = 0; i < 256; i++) lut[i] = (i - low) * ratio
      return lut
    }
    const lutR = contrastLUT(bounds(histR))
    const lutG = contrastLUT(bounds(histG))
    const lutB = contrastLUT(bounds(histB))

    // ความสว่างเฉลี่ยหลังคอนทราสต์ — คำนวณจาก histogram ตรงๆ (E[LUT(X)]) ไม่ต้องไล่พิกเซลซ้ำรอบ
    const meanOf = (lut, hist) => {
      let sum = 0
      for (let i = 0; i < 256; i++) sum += lut[i] * hist[i]
      return sum / sampleCount
    }
    const meanLum = 0.2126 * meanOf(lutR, histR) + 0.7152 * meanOf(lutG, histG) + 0.0722 * meanOf(lutB, histB)

    // gamma ดันความสว่างเฉลี่ยเข้าใกล้เป้าหมาย — ข้ามถ้ารูปมืด/สว่างสุดขั้วจนสูตรไม่เสถียร (ln(0))
    let gamma = 1
    if (meanLum > 2 && meanLum < 253) {
      gamma = Math.log(AUTO_TARGET_LUM) / Math.log(meanLum / 255)
      gamma = Math.min(AUTO_GAMMA_CLAMP[1], Math.max(AUTO_GAMMA_CLAMP[0], gamma))
    }

    // ผสม gamma เข้า LUT เดิม — ยังเป็น 256 entries ต่อ channel เท่าเดิม ไม่เพิ่มรอบพิกเซล
    const finalLUT = lut => {
      const out = new Uint8ClampedArray(256)
      for (let i = 0; i < 256; i++) out[i] = 255 * Math.pow(lut[i] / 255, gamma)
      return out
    }
    const fR = finalLUT(lutR), fG = finalLUT(lutG), fB = finalLUT(lutB)

    // satFactor แปรผกผันกับความจัดสีปัจจุบัน — จัดอยู่แล้วดันน้อย/ไม่ดัน จืดอยู่แล้วดันมากขึ้น
    const avgChroma = chromaSum / sampleCount
    const satFactor = avgChroma >= AUTO_SAT_TARGET_CHROMA
      ? 1
      : 1 + (AUTO_SAT_MAX_BOOST - 1) * (1 - avgChroma / AUTO_SAT_TARGET_CHROMA)

    // รอบจริง — ไล่ทุกพิกเซล (จำเป็น ต่างจากรอบสุ่มตัวอย่างข้างบน) LUT + saturation ในลูปเดียว
    // เขียนลง buffer ใหม่ ไม่แตะ `data` เดิม — base ต้องสะอาดไว้ blend กับผลนี้ตาม strength
    const out = new Uint8ClampedArray(data.length)
    for (let p = 0; p < data.length; p += 4) {
      const r = fR[data[p]], g = fG[data[p + 1]], b = fB[data[p + 2]]
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      out[p]     = lum + (r - lum) * satFactor
      out[p + 1] = lum + (g - lum) * satFactor
      out[p + 2] = lum + (b - lum) * satFactor
      out[p + 3] = data[p + 3]   // alpha ไม่แตะ — เหลือเดิมเสมอ
    }
    return out
  }

  // เปิดโหมดพรีวิว — คำนวณผลเต็ม 100% ครั้งเดียว ที่เหลือแค่ blend เบาๆ ตาม slider
  // คง enhanceStrength เดิมไว้ตอนเปิดซ้ำ (ไม่รีเซ็ตเป็น 100%) — กลับมาปรับต่อจากค่าที่ทิ้งไว้ล่าสุด
  function startEnhance() {
    if (!ready || enhancing) return
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const base = ctx.getImageData(0, 0, c.width, c.height)
    enhanceBaseRef.current = base
    enhanceFullRef.current = computeAutoEnhance(base)
    enhancePrevToolRef.current = tool   // จำเครื่องมือก่อนหน้าไว้ กลับไปที่นี่ตอน commit/cancel
    setSel(null)
    setTool('enhance')
    setEnhancing(true)
    drawEnhancePreview(enhanceStrength)
  }

  // blend base↔full ตาม strength แล้ววาดลง canvas จริง (ยังไม่ commit เข้า undo)
  function drawEnhancePreview(strength) {
    const base = enhanceBaseRef.current, full = enhanceFullRef.current
    if (!base || !full) return
    const c = canvasRef.current
    const ctx = c.getContext('2d')
    const t = strength / 100
    const out = ctx.createImageData(base.width, base.height)
    const bd = base.data
    for (let p = 0; p < bd.length; p += 4) {
      out.data[p]     = bd[p]     + (full[p]     - bd[p])     * t
      out.data[p + 1] = bd[p + 1] + (full[p + 1] - bd[p + 1]) * t
      out.data[p + 2] = bd[p + 2] + (full[p + 2] - bd[p + 2]) * t
      out.data[p + 3] = bd[p + 3]
    }
    ctx.putImageData(out, 0, 0)
  }

  // ⚠️ throttle ด้วย rAF — <input type=range> ยิง onChange ถี่มากตอนลาก ถ้า putImageData
  //    เต็ม canvas ทุก tick (~10-40ms/ครั้งบนรูป 2048px) จะหน่วงจนลากแล้วสะดุด
  function onEnhanceSlider(v) {
    setEnhanceStrength(v)
    if (enhanceRafRef.current) cancelAnimationFrame(enhanceRafRef.current)
    enhanceRafRef.current = requestAnimationFrame(() => drawEnhancePreview(v))
  }

  // Commit ตอน slider เสีย focus (onBlur) — คลิกปุ่มเครื่องมืออื่น/พื้นหลัง/ปิดโมดัลจะ blur เองตามธรรมชาติ
  // ระหว่างที่ยังโฟกัสอยู่ที่ slider (ลาก/กดคีย์ลูกศรถี่ๆ) ปรับกี่ทีก็ได้โดยยังไม่ commit จนกว่าจะย้ายโฟกัสจริง
  // (เคาะ 2026-08-08: ปรับแล้วอย่าเพิ่งบังคับออกจาก tool — ต้องปรับซ้ำได้โดยไม่โดนเด้งกลับ crop/mask ทุกครั้ง)
  // ฟังก์ชันอื่นที่ปิด/พลิก/สลับ tool ก็เรียกซ้ำเป็น safety net (เผื่อ ESC ที่ไม่ผ่าน blur)
  //
  // ⚠️ ต้องคืน canvas กลับเป็นต้นฉบับ**ก่อน**เรียก pushUndo() เสมอ — pushUndo() snapshot
  //    จากสิ่งที่วาดอยู่ตอนนั้นตรงๆ ถ้า snapshot ตอนยังเป็นพรีวิวค้างอยู่ ปุ่มย้อนกลับจะพาไปที่
  //    "พรีวิวค่าหนึ่ง" แทนที่จะเป็นต้นฉบับจริง (เจอตอนออกแบบ 2026-08-08)
  function commitEnhance() {
    if (!enhancing) return
    const base = enhanceBaseRef.current
    if (base) {
      const c = canvasRef.current
      const ctx = c.getContext('2d')
      ctx.putImageData(base, 0, 0)         // คืนต้นฉบับก่อน
      pushUndo()                           // แล้วค่อย snapshot ต้นฉบับจริงเข้า undo stack
      drawEnhancePreview(enhanceStrength)  // วาดค่าที่เลือกไว้ทับกลับเข้าไป = ค่าที่ commit จริง
    }
    enhanceBaseRef.current = null
    enhanceFullRef.current = null
    setEnhancing(false)
    setTool(enhancePrevToolRef.current)
  }

  // ── บันทึก ──────────────────────────────────────────────────────────────────
  // ⚠️ ไม่ปิดกล่องหลังบันทึก (เคาะ 2026-08-26) — แก้ต่อได้เรื่อยๆ ในกล่องเดิม กด X เองเมื่อพอใจ
  //    steps รีเซ็ตเป็น 0 หลังเซฟสำเร็จ กัน requestClose()/go() ถามยืนยันทิ้งงานทั้งที่เซฟไปแล้ว
  async function save() {
    if (saving || !steps) return
    setSaving(true)
    setError('')
    setSaved(false)
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
      setSteps(0)
      setSaved(true)
    } catch {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // ลบรูปนี้ทิ้งทั้งชิ้น — ไม่ใช่ undo ระดับแก้ไข จึงถามยืนยันเสมอไม่ว่าจะแก้ค้างอยู่หรือไม่ (steps > 0 ไม่เกี่ยว)
  async function handleDelete() {
    if (deleting || !confirm(t('confirmDelete'))) return
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
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
          {/* ลำดับ: มือจับ → ครอบตัด → เบลอ → หมุน → ไม้กายสิทธิ์ (เรียงใหม่ 2026-08-26 ตาม user)
              ไอคอนล้วนไม่มีข้อความ กัน 6 ปุ่มล้นจอมือถือ · hand รวมอยู่ใน `tool` เดียวกับ crop/mask/enhance
              แล้ว (ไม่ใช่ state แยก) กันปุ่ม 2 อันโชว์ ON พร้อมกัน */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => selectTool('hand')} disabled={!ready} title={t('toolHand')} className={`${TOOL_BTN} ${tool === 'hand' ? TOOL_ON : TOOL_OFF} disabled:opacity-40`}>
              <Hand size={15} />
            </button>
            <button type="button" onClick={() => selectTool('crop')} disabled={!ready} title={t('toolCrop')} className={`${TOOL_BTN} ${tool === 'crop' ? TOOL_ON : TOOL_OFF} disabled:opacity-40`}>
              <Crop size={15} />
            </button>
            <button type="button" onClick={() => selectTool('mask')} disabled={!ready} title={t('toolMask')} className={`${TOOL_BTN} ${tool === 'mask' ? TOOL_ON : TOOL_OFF} disabled:opacity-40`}>
              <Droplets size={15} />
            </button>
            <button type="button" onClick={rotate} disabled={!ready} title={t('toolRotate')} className={`${TOOL_BTN} ${TOOL_OFF} disabled:opacity-40`}>
              <RotateCw size={15} />
            </button>
            {/* enhancing=true = พรีวิวเปิดค้างอยู่ ปุ่มนี้เอง disable ไปด้วยกันกดซ้อนตัวเองระหว่างลาก slider */}
            <button type="button" onClick={startEnhance} disabled={!ready || enhancing} title={t('toolEnhance')} className={`${TOOL_BTN} ${tool === 'enhance' ? TOOL_ON : TOOL_OFF} disabled:opacity-40`}>
              <Wand2 size={15} />
            </button>
            <button
              type="button" onClick={undo} disabled={!steps || enhancing} title={t('undo')}
              className={`ml-auto ${TOOL_BTN} ${TOOL_OFF} disabled:opacity-40`}
            >
              <Undo2 size={15} />
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
            ) : tool === 'crop' ? (
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
            ) : tool === 'enhance' ? (
              // enhance — slider 0-150% blend ระหว่างต้นฉบับ (0%) กับผลไม้กายสิทธิ์เต็ม (100%)
              // เกิน 100% ได้ถึง 150% เผื่อรูปที่จืดมากอยากดันแรงกว่าค่าที่คำนวณให้อัตโนมัติ
              // ยังโฟกัส slider อยู่ = ปรับซ้ำได้เรื่อยๆ ไม่ commit จนกว่าจะ blur (คลิกที่อื่น/ปุ่มอื่น)
              <div className="flex items-center gap-3 w-full">
                <span className="text-warm-500 dark:text-disc-muted shrink-0">{t('enhanceStrength')}</span>
                <input
                  type="range" min={0} max={150} value={enhanceStrength}
                  onChange={e => onEnhanceSlider(Number(e.target.value))}
                  onBlur={commitEnhance}
                  className="flex-1 accent-teal"
                />
                <span className="text-warm-500 dark:text-disc-muted w-11 text-right shrink-0 tabular-nums">{enhanceStrength}%</span>
              </div>
            ) : null /* tool === 'hand' — ไม่มีตัวเลือกย่อย */}
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
            {/* stage = viewport ที่ครอบรูป กว้าง/สูงเท่ารูปจริงเสมอ (ไม่ขยับตามซูม) — overflow-hidden
                คลิปสิ่งที่ล้นออกไปตอนซูมเข้า · ต่อ wheel listener ที่นี่ (ดู useEffect ด้านบน) */}
            <div
              ref={stageRef}
              onPointerDown={onStageDown}
              onPointerMove={onStageMove}
              onPointerUp={onStageUp}
              onPointerCancel={onStageUp}
              style={{ cursor: tool === 'hand' ? 'grab' : tool === 'enhance' ? 'default' : 'crosshair' }}
              className="relative inline-block max-w-full overflow-hidden rounded-md touch-none"
            >
              {/* ชั้นนี้เท่านั้นที่โดน transform — canvas + กรอบเลือกอยู่ในนี้ด้วยกัน จะได้เลื่อน/ซูมพร้อมกันเป๊ะๆ */}
              <div
                className="relative inline-block"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center center' }}
              >
                <canvas ref={canvasRef} className="block max-w-full max-h-[62vh] w-auto h-auto" />
                {/* เลือกกรอบได้เฉพาะตอน tool เป็น crop/mask — โหมดมือจับ/ปรับแสง ลากทั้งหมด = เลื่อนรูปที่ stage ด้านนอกแทน */}
                {(tool === 'crop' || tool === 'mask') && (
                  <div
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    className="absolute inset-0 cursor-crosshair"
                  >
                    {box && (
                      <div
                        style={box}
                        className={`absolute border-2 ${tool === 'crop' ? 'border-teal bg-white/10' : 'border-orange bg-orange/20'}`}
                      />
                    )}
                  </div>
                )}
              </div>
              {/* ปุ่ม/ป้ายลอย — อยู่นอกชั้น transform ข้างบน จะได้ไม่ขยับ/โตตามซูม */}
              {onDelete && (
                <button
                  type="button" onClick={handleDelete} disabled={deleting} title={t('deleteTitle')}
                  className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 disabled:opacity-40 transition"
                >
                  {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              )}
              {zoom !== 1 && (
                <button
                  type="button" onClick={resetView} title={t('resetZoom')}
                  className="absolute bottom-2 left-2 px-2 py-1 text-xs rounded-md bg-black/60 text-white hover:bg-black/80 transition tabular-nums"
                >
                  {Math.round(zoom * 100)}%
                </button>
              )}
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

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border shrink-0">
          {/* enhance ไม่มีปุ่มในนี้แล้ว — commit เองตอนปล่อย slider (ดู commitEnhance) */}
          {sel && !enhancing ? (
            <button
              type="button"
              onClick={tool === 'crop' ? applyCrop : applyMask}
              className="whitespace-nowrap px-3 py-2 text-sm rounded-lg bg-teal text-white hover:opacity-90 transition"
            >
              {tool === 'crop' ? t('applyCrop') : t('applyMask')}
            </button>
          ) : saved ? (
            <span className="text-sm text-teal">{t('saveSuccess')}</span>
          ) : <span />}
          <div className="flex items-center gap-2">
          <button
            type="button" onClick={requestClose}
            className="whitespace-nowrap px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            {t('cancel')}
          </button>
          <button
            type="button" onClick={save} disabled={saving || !steps || enhancing}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {t('save')}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
