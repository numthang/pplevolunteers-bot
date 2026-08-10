'use client'

// การ์ดคำคม — 2 ขั้น: (1) รูปพื้นหลัง + ครอป + ข้อความ  (2) เลือกสไตล์แล้วบันทึก
//
// ⚠️ ครอปต้องอยู่ขั้น 1 เสมอ ห้ามย้ายไปหลังเลือกสไตล์ — renderer คำนวณตำแหน่งข้อความจาก
// **ขนาดภาพ** (utils/quoteStyles.js) ครอปทีหลัง = ข้อความโดนตัดขาด · ฝั่งบอทก็ครอปก่อน
// render เหมือนกัน (handlers/quoteHandler.js:329)
//
// ⚠️ ไม่มีลายน้ำในนี้ตั้งใจ — ลายน้ำติดตอนเผยแพร่ที่ PostPublishPanel ที่เดียว ไม่งั้นแปะซ้ำ 2 ชั้น
//
// กฎ Create (CLAUDE.md): ห้ามสร้างแถวใน DB จนกว่าจะกด "บันทึกเข้าโพสต์"
// → พรีวิวยิง /quote/preview ที่ไม่แตะ DB · บันทึกยิง /quote
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Cropper from 'react-easy-crop'
import { X, Upload, Loader2, Sparkles, ImageIcon, ChevronLeft, Images } from 'lucide-react'
import AssetPickerModal from './AssetPickerModal.jsx'
import {
  FINISHES, LAYOUTS, COMBOS, styleKey, comboExists, fallbackLayout,
  PLAIN_BGS, plainKey, isPlainStyle,
} from '@/lib/quoteStyles.js'

const ACCEPT = 'image/png,image/jpeg,image/webp'

// สัดส่วนตามที่แต่ละแพลตฟอร์มใช้จริง
const ASPECTS = [
  { key: '1:1', label: '1:1', value: 1 },
  { key: '4:5', label: '4:5', value: 4 / 5 },
  { key: '16:9', label: '16:9', value: 16 / 9 },
]

// ค่าเดียวกับ COLOR_OPTIONS ของบอท (handlers/quoteHandler.js)
const COLORS = [
  { value: '1.0', key: 'colorFull' },
  { value: '0.55', key: 'colorMid' },
  { value: '0.15', key: 'colorBw' },
]

// ค่าที่ตั้งไว้มักเป็นค่าเดิมทุกใบ → จำค่าล่าสุดไว้ในเครื่อง (ฝั่งบอทก็จำผ่าน quote_state เหมือนกัน)
//
// จำ: finish · layout · saturation · aspect · authorName
// ไม่จำ: รูปพื้นหลัง · ครอป/ซูม · ข้อความคำคม (เป็นของเฉพาะใบนั้น จำไปก็ผิด)
//
// ⚠️ จำเฉพาะตอน **บันทึกสำเร็จ** เท่านั้น ไม่งั้นกดเล่นแล้วยกเลิกก็ติดไปด้วย
// ⚠️ ค่าที่จำไว้ทับ `quote_default_template` ที่ตั้งใน /org/settings/brand → config นั้นจึงมีผล
//    แค่ครั้งแรกของผู้ใช้แต่ละคน (ฝั่งบอทยังใช้ config ปกติ)
const LAST_LS_KEY = 'posts.quoteLast'
const AUTHOR_LS_KEY = 'posts.quoteAuthor'   // คีย์เดิม — อ่านต่อได้เพื่อไม่ให้ค่าที่เคยจำไว้หาย

const FINISH_CHIPS = [...FINISHES]

function loadLast() {
  try { return JSON.parse(localStorage.getItem(LAST_LS_KEY) || '{}') || {} } catch { return {} }
}

// ⛔ ห้ามใส่ค่าตั้งต้นแบบ hardcode (เดิมมี DEV_DEFAULTS ไว้กดเทสรัวๆ — เอาออกแล้ว)
//    ค่าตั้งต้นทุกตัวมาจากข้อมูลจริงของโพสต์ ถ้าเติมค่าปลอมทับไว้ guard `prev || x`
//    ข้างล่างจะไม่ยิงเลยตอน dev = เทสของจริงไม่ได้จนกว่าจะ build production

const AUTHOR_MAX = 35   // ต้องตรงกับ maxLength ของช่องผู้พูด — ชื่อองค์กรยาวกว่านี้ต้องตัดก่อนเติม

const inputCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg ' +
  'text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal'

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = url
  })
}

/** ครอปฝั่ง client → Blob (ทำก่อนส่งไป render เสมอ) */
async function cropToBlob(src, area) {
  const image = await loadImageEl(src)
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
}

export default function QuoteGeneratorModal({ postId, onClose, onSaved }) {
  const t = useTranslations('posts.quoteModal')
  const tl = useTranslations('posts.library')

  const [step, setStep] = useState(1)
  const [error, setError] = useState('')

  // ── ขั้น 1: พื้นหลัง ───────────────────────────────────────────────────────
  const [srcUrl, setSrcUrl] = useState(null)      // objectURL หรือ /api/posts/media/<id>
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState(ASPECTS[0].value)
  const [areaPixels, setAreaPixels] = useState(null)
  const [postMedia, setPostMedia] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)

  const [quoteText, setQuoteText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [aiQuotes, setAiQuotes] = useState([])
  const [orgName, setOrgName] = useState('')   // ตัวเลือกชื่อผู้พูด ไม่ใช่ค่า prefill — ดูหมายเหตุที่ปุ่มชิป

  // ── ขั้น 2: พรีวิว ────────────────────────────────────────────────────────
  // สไตล์ = finish + layout · เก็บแยกกันใน state แล้วประกอบเป็นคีย์ตอนยิง API
  const [finish, setFinish] = useState(FINISHES[0].value)
  const [layout, setLayout] = useState(COMBOS[FINISHES[0].value][0])
  const [saturation, setSaturation] = useState('1.0')

  // การ์ดไม่มีรูป — เป็น **โหมด** ไม่ใช่ finish ตัวที่ 4 โดยตั้งใจ: ถ้าเป็นชิปใน finish
  // ผู้ใช้กดสลับกลับไปหา 'เงา' ได้ทั้งที่ไม่เคยเลือกรูป แล้วพังทั้งฝั่ง client (bgBlob เป็น null)
  // และฝั่ง server (400 'ยังไม่ได้เลือกรูปพื้นหลัง') · เป็นโหมดแล้ว COMBOS/localStorage ไม่ต้องแตะเลย
  const [noBg, setNoBg] = useState(false)
  const [plainBg, setPlainBg] = useState(PLAIN_BGS[0].value)
  const [watermarks, setWatermarks] = useState([])   // ลายน้ำทุกกลุ่มที่โพสต์ในนามได้
  const [wmType, setWmType] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [saving, setSaving] = useState(false)

  const bgPathRef = useRef(null)      // path ที่ server คืนมารอบแรก — รอบหลังไม่ต้องอัปไฟล์ซ้ำ
  const bgBlobRef = useRef(null)
  const fileInputRef = useRef(null)
  const objectUrls = useRef([])
  const reqSeq = useRef(0)            // กันผลลัพธ์เก่ามาทับใหม่ตอนกดสลับสไตล์รัวๆ

  const trackUrl = url => { objectUrls.current.push(url); return url }

  // ปิดได้ 3 ทาง: ปุ่ม X · ESC · คลิกนอกกล่อง (กฎ CLAUDE.md)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => () => objectUrls.current.forEach(u => URL.revokeObjectURL(u)), [])

  // ค่าที่ใช้ล่าสุด — อ่านหลัง mount ไม่ใช่ใน useState เพราะ localStorage ไม่มีตอน SSR
  useEffect(() => {
    const last = loadLast()
    // finish/layout ต้องเช็คว่ายังมีอยู่จริง — สไตล์ถูกตัดออกได้ (เช่น 'ข้างซ้าย' ที่ตัดไป)
    // ค่าที่จำไว้จะกลายเป็นคีย์ที่ไม่มีใน STYLES แล้วเรนเดอร์พังทั้งใบ
    if (COMBOS[last.finish]) {
      setFinish(last.finish)
      setLayout(comboExists(last.finish, last.layout) ? last.layout : fallbackLayout(last.finish))
    }
    if (COLORS.some(c => c.value === last.saturation)) setSaturation(last.saturation)
    if (ASPECTS.some(a => a.value === last.aspect)) setAspect(last.aspect)
    // จำเฉพาะ "ตั้งค่าไว้ยังไง" ไม่จำ "โหมดไหน" — ดูหมายเหตุตอนเขียนค่าใน save()
    if (PLAIN_BGS.some(b => b.value === last.plainBg)) setPlainBg(last.plainBg)
    if (typeof last.wmType === 'string') setWmType(last.wmType)

    try {
      const author = last.authorName || localStorage.getItem(AUTHOR_LS_KEY)
      if (author) setAuthorName(author)
    } catch { /* โหมดส่วนตัว/ปิด storage — ไม่ใช่เรื่องคอขาดบาดตาย */ }
  }, [])

  // สื่อในโพสต์ (ไว้เลือกเป็นพื้นหลัง) + ข้อความที่ AI เคยเสนอไว้
  //
  // ⚠️ ค่าตั้งต้นทุกตัวในนี้มาถึงช้ากว่า mount → ต้อง set แบบ `prev => prev || ค่าใหม่` เสมอ
  //    ยัดค่าตรงๆ = ทับชื่อผู้พูดจาก localStorage (effect ข้างบนที่รันไปแล้ว) และทับสิ่งที่
  //    ผู้ใช้พิมพ์/เลือกระหว่างรอ fetch · เช็ค `if (!quoteText)` ข้างนอกไม่ช่วย เพราะ closure
  //    ของ .then เห็นค่าตอน mount เสมอ
  useEffect(() => {
    let alive = true
    fetch(`/api/posts/${postId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return
        const media = (d.data?.media || []).filter(m => m.kind !== 'video' && m.path)
        setPostMedia(media)
        setOrgName(d.data?.post?.org_name || '')
        // เลือกรูปแรกให้เลย ผู้ใช้แค่ครอปต่อ — ข้าม kind 'quote' เพราะการ์ดคำคมที่เคยทำไว้
        // ก็เก็บใน post_episode_media เหมือนกัน เอามาเป็นพื้นหลังจะได้การ์ดซ้อนการ์ด
        const first = media.find(m => m.kind !== 'quote')
        if (first) setSrcUrl(prev => prev || `/api/posts/media/${first.id}`)
      })
      .catch(() => {})

    fetch(`/api/posts/${postId}/ai-suggestions`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return
        // ชุดใหม่สุดอยู่ก่อน — รวม quotes ทุกชุดแล้วตัดซ้ำ
        const all = (d.data || []).flatMap(s => s.payload?.quotes || [])
        const list = [...new Set(all.filter(Boolean))].slice(0, 12)
        setAiQuotes(list)
        if (list[0]) setQuoteText(prev => prev || list[0])
      })
      .catch(() => {})

    return () => { alive = false }
  }, [postId])

  function pickFile(file) {
    if (!file) return
    setError('')
    bgPathRef.current = null                      // รูปใหม่ = path เดิมใช้ไม่ได้แล้ว
    bgBlobRef.current = null
    setSrcUrl(trackUrl(URL.createObjectURL(file)))
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  function pickFromPost(m) {
    setError('')
    bgPathRef.current = null
    bgBlobRef.current = null
    setSrcUrl(`/api/posts/media/${m.id}`)
    setPickerOpen(false)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  /** ยิง preview — ส่งไฟล์เฉพาะรอบแรก รอบต่อไปส่ง bgPath ที่ server คืนมา */
  const render = useCallback(async (styleKey, sat, wm = '') => {
    const seq = ++reqSeq.current
    setRendering(true)
    setError('')
    try {
      const form = new FormData()
      // ไม่มีรูป = ไม่แตะ bg เลย · แตะเมื่อไหร่ FormData.append(name, null) โยนทิ้งตั้งแต่ฝั่ง client
      if (isPlainStyle(styleKey)) {
        if (wm) form.append('wmType', wm)
      } else if (bgPathRef.current) {
        form.append('bgPath', bgPathRef.current)
      } else {
        form.append('bg', bgBlobRef.current, 'bg.jpg')
      }
      form.append('quoteText', quoteText)
      form.append('authorName', authorName)
      form.append('style', styleKey)
      if (sat && !isPlainStyle(styleKey)) form.append('saturation', sat)

      const res = await fetch(`/api/posts/${postId}/media/quote/preview`, { method: 'POST', body: form })
      if (seq !== reqSeq.current) return                     // มีคำขอใหม่กว่าแล้ว ทิ้งผลนี้
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || t('loadFailed'))
        return
      }
      const path = res.headers.get('X-Bg-Path')
      if (path) bgPathRef.current = path
      setPreviewUrl(trackUrl(URL.createObjectURL(await res.blob())))
    } catch {
      if (seq === reqSeq.current) setError(t('loadFailed'))
    } finally {
      if (seq === reqSeq.current) setRendering(false)
    }
  }, [postId, quoteText, authorName, t])

  const style = noBg ? plainKey(plainBg) : styleKey(finish, layout)

  async function goPreview() {
    if (!quoteText.trim()) { setError(t('needText')); return }
    if (noBg) { setStep(2); render(style, null, wmType); return }
    if (!srcUrl || !areaPixels) { setError(t('needBg')); return }
    bgBlobRef.current = await cropToBlob(srcUrl, areaPixels)   // ครอปก่อน render เสมอ
    bgPathRef.current = null
    setStep(2)
    render(style, saturation)
  }

  /** สลับโหมด "ไม่ใช้รูป" — โหลดรายการลายน้ำครั้งแรกที่เปิดโหมดนี้เท่านั้น */
  function toggleNoBg(next) {
    setNoBg(next)
    setError('')
    if (!next || watermarks.length) return
    fetch('/api/posts/watermarks')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setWatermarks(Array.isArray(d?.options) ? d.options : []))
      .catch(() => {})
  }

  function changePlainBg(next) {
    setPlainBg(next)
    // เลือก "ลายน้ำ" แต่ยังไม่ได้เลือกไฟล์ = หยิบตัวแรกให้เลย ไม่งั้นกดแล้วได้พื้นสีล้วนเฉยๆ
    const wm = next === 'logo' ? (wmType || watermarks[0]?.value || '') : wmType
    if (wm !== wmType) setWmType(wm)
    render(plainKey(next), null, wm)
  }
  function changeWatermark(next) {
    setWmType(next)
    render(plainKey(plainBg), null, next)
  }

  function changeFinish(next) {
    setFinish(next)
    // layout เดิมอาจไม่มีใน finish ใหม่ (เช่น matte มีเฉพาะ 'ทึบ') → ย้ายไปตัวแรกที่ใช้ได้
    const nextLayout = comboExists(next, layout) ? layout : fallbackLayout(next)
    setLayout(nextLayout)
    render(styleKey(next, nextLayout), saturation)
  }
  function changeLayout(next) {
    setLayout(next)
    render(styleKey(finish, next), saturation)
  }
  function changeColor(next) {
    setSaturation(next)
    render(style, next)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const form = new FormData()
      if (noBg) {
        if (wmType) form.append('wmType', wmType)
      } else if (bgPathRef.current) {
        form.append('bgPath', bgPathRef.current)
      } else {
        form.append('bg', bgBlobRef.current, 'bg.jpg')
      }
      form.append('quoteText', quoteText)
      form.append('authorName', authorName)
      form.append('style', style)
      if (!noBg) form.append('saturation', saturation)

      const res = await fetch(`/api/posts/${postId}/media/quote`, { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || t('loadFailed')); return }
      // จำค่าที่ตั้งไว้ให้ใบถัดไป — เฉพาะตอนบันทึกสำเร็จ ไม่งั้นค่าที่กดเล่นแล้วยกเลิกก็ติดไปด้วย
      try {
        // ⚠️ **ไม่จำโหมด `noBg`** โดยตั้งใจ — โมดัลเลือกรูปแรกของโพสต์ให้อัตโนมัติอยู่แล้ว
        //    จำโหมดไว้ = คราวหน้าเปิดมาเจอพื้นสีล้วนทั้งที่มีรูปรออยู่ตรงหน้า · จำแค่ค่าที่ตั้งไว้
        localStorage.setItem(LAST_LS_KEY, JSON.stringify({
          finish, layout, saturation, aspect, plainBg, wmType, authorName: authorName.trim(),
        }))
        if (authorName.trim()) localStorage.setItem(AUTHOR_LS_KEY, authorName.trim())
      } catch { /* ไม่มี storage ก็ช่าง */ }
      onSaved?.(d.data)
      onClose()
    } catch {
      setError(t('loadFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-disc-border shrink-0">
          <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">
            {t('title')} — <span className="font-normal text-warm-500 dark:text-disc-muted">{step === 1 ? t('step1') : t('step2')}</span>
          </h2>
          <button
            type="button" onClick={onClose} title={t('closeTitle')}
            className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {step === 1 ? (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('bgLabel')}</span>

                {/* มีรูป / ไม่มีรูป — เลือกตั้งแต่ต้นทาง เพราะทั้ง 2 ทางใช้ renderer คนละตัว */}
                <div className="flex flex-wrap gap-2">
                  {[[false, t('modeImage')], [true, t('modePlain')]].map(([v, label]) => (
                    <button
                      key={String(v)} type="button" onClick={() => toggleNoBg(v)}
                      className={`px-2.5 py-1 text-sm rounded-lg border transition ${
                        noBg === v
                          ? 'border-orange bg-orange text-white'
                          : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <input
                  ref={fileInputRef} type="file" accept={ACCEPT} className="hidden"
                  onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }}
                />
                <div className={`flex-wrap gap-2 ${noBg ? 'hidden' : 'flex'}`}>
                  <button
                    type="button" onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                  >
                    <Upload size={14} /> {srcUrl ? t('bgChange') : t('bgUpload')}
                  </button>
                  <button
                    type="button" onClick={() => setPickerOpen(v => !v)} disabled={!postMedia.length}
                    title={postMedia.length ? undefined : t('bgFromPostEmpty')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ImageIcon size={14} /> {t('bgFromPost')}
                  </button>
                  {/* จากคลังภาพ — เลือกแล้วครอปฝั่ง client แล้วอัปเป็นไฟล์ใหม่ (กิ่ง bgFile)
                      ไฟล์ในคลังจึงไม่ถูกลากไปลบตอนลบการ์ดคำคมทีหลัง */}
                  <button
                    type="button" onClick={() => setLibraryOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                  >
                    <Images size={14} /> {tl('fromLibrary')}
                  </button>
                </div>

                {pickerOpen && postMedia.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 p-2 rounded-lg border border-warm-200 dark:border-disc-border">
                    {postMedia.map(m => (
                      <button
                        key={m.id} type="button" onClick={() => pickFromPost(m)}
                        className="aspect-square rounded-md overflow-hidden border border-warm-200 dark:border-disc-border hover:ring-2 hover:ring-teal transition"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/posts/media/${m.id}`} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {noBg && (
                <p className="text-sm text-warm-500 dark:text-disc-muted">{t('plainHint')}</p>
              )}

              {srcUrl && !noBg && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-warm-700 dark:text-disc-text">{t('cropLabel')}</span>
                    {ASPECTS.map(a => (
                      <button
                        key={a.key} type="button" onClick={() => setAspect(a.value)}
                        className={`px-2.5 py-1 text-sm rounded-lg border transition ${
                          aspect === a.value
                            ? 'border-orange bg-orange text-white'
                            : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative h-[260px] rounded-lg overflow-hidden bg-black">
                    <Cropper
                      image={srcUrl} crop={crop} zoom={zoom} aspect={aspect}
                      onCropChange={setCrop} onZoomChange={setZoom}
                      onCropComplete={(_a, px) => setAreaPixels(px)}
                      showGrid={false}
                    />
                  </div>
                  <p className="text-sm text-warm-500 dark:text-disc-muted">{t('cropHint')}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('textLabel')}</span>
                <textarea
                  value={quoteText} onChange={e => setQuoteText(e.target.value)}
                  rows={3} maxLength={300} placeholder={t('textPlaceholder')}
                  className={inputCls + ' resize-y'}
                />
                {aiQuotes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center gap-1 text-sm text-warm-500 dark:text-disc-muted">
                      <Sparkles size={13} /> {t('aiQuotes')}
                    </span>
                    <div className="flex flex-col gap-1">
                      {aiQuotes.map((q, i) => (
                        <button
                          key={i} type="button" onClick={() => setQuoteText(q)} title={t('aiQuotesUse')}
                          className="text-left text-sm px-2.5 py-1.5 rounded-lg border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('authorLabel')}</span>
                <input
                  value={authorName} onChange={e => setAuthorName(e.target.value)}
                  maxLength={AUTHOR_MAX} placeholder={t('authorPlaceholder')} className={inputCls}
                />
                {/* ⚠️ ชื่อองค์กรเป็น "ปุ่มให้กด" ไม่ใช่ค่า prefill โดยตั้งใจ —
                    ช่องนี้คือ **ผู้พูด** ไม่ใช่คนทำการ์ด เติมชื่อองค์กรให้เองแปลว่าการ์ดใบแรก
                    ของทุกคนตั้งต้นด้วยการยกคำพูดให้องค์กรทั้งที่ไม่ได้พูด กดผ่านเมื่อไหร่ = อ้างผิดคน */}
                {orgName && authorName.trim() !== orgName.slice(0, AUTHOR_MAX) && (
                  <div>
                    <button
                      type="button" onClick={() => setAuthorName(orgName.slice(0, AUTHOR_MAX))}
                      title={t('authorOrgUse')}
                      className="px-2.5 py-1 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                    >
                      {orgName}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="relative rounded-lg overflow-hidden bg-black min-h-[240px] flex items-center justify-center">
                {previewUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewUrl} alt="" className="w-full h-auto max-h-[46vh] object-contain" />
                )}
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-white text-sm">
                    <Loader2 size={16} className="animate-spin" /> {t('rendering')}
                  </div>
                )}
              </div>

              {/* โหมดไม่มีรูป: ไม่มีการวางให้เลือก (กลางการ์ดอย่างเดียว) และไม่มีสีภาพให้ปรับ
                  เหลือแค่ "พื้นหลัง" + ลายน้ำ — จึงสลับทั้งท่อนแทนที่จะจางปุ่มทิ้งไว้ 3 แถว */}
              {noBg ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('plainBgLabel')}</span>
                    <div className="flex flex-wrap gap-2">
                      {PLAIN_BGS.filter(b => b.value !== 'logo' || watermarks.length).map(b => (
                        <button
                          key={b.value} type="button" onClick={() => changePlainBg(b.value)}
                          disabled={rendering} title={b.description}
                          className={`px-2.5 py-1 text-sm rounded-lg border transition disabled:opacity-50 ${
                            plainBg === b.value
                              ? 'border-orange bg-orange text-white'
                              : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                          }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {plainBg === 'logo' && watermarks.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('watermarkLabel')}</span>
                      <select
                        value={wmType} onChange={e => changeWatermark(e.target.value)}
                        disabled={rendering} className={inputCls}
                      >
                        {watermarks.map(w => (
                          <option key={w.value} value={w.value}>{w.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <>
              {/* 2 ตัวเลือกแยกกัน: การลงสี × การวาง — สไตล์คือผลคูณของสองอันนี้
                  (เดิมเป็น dropdown เดียวยาว 16 รายการ ผู้ใช้อ่านไม่ออกว่าอะไรต่างจากอะไร) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('finishLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {FINISH_CHIPS.map(f => (
                    <button
                      key={f.value} type="button" onClick={() => changeFinish(f.value)}
                      disabled={rendering} title={f.description}
                      className={`px-2.5 py-1 text-sm rounded-lg border transition disabled:opacity-50 ${
                        finish === f.value
                          ? 'border-orange bg-orange text-white'
                          : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('layoutLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {LAYOUTS.map(l => {
                    // คู่ที่เรนเดอร์ไม่ได้ = จางกดไม่ได้ ไม่ใช่ซ่อน ผู้ใช้จะได้รู้ว่ามีอยู่แต่คู่นี้ไม่มี
                    const ok = comboExists(finish, l.value)
                    return (
                      <button
                        key={l.value} type="button" onClick={() => changeLayout(l.value)}
                        disabled={rendering || !ok}
                        title={ok ? undefined : t('comboUnavailable')}
                        className={`px-2.5 py-1 text-sm rounded-lg border transition disabled:cursor-not-allowed ${
                          layout === l.value
                            ? 'border-orange bg-orange text-white'
                            : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                        } ${ok ? '' : 'opacity-35'}`}
                      >
                        {l.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ดูโอโทนแปลงรูปเป็นขาวดำก่อนย้อมอยู่แล้ว → ปุ่มสีภาพไม่มีผล ซ่อนทิ้งดีกว่าให้กดแล้วเงียบ */}
              {finish !== 'duo' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('colorLabel')}</span>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <button
                        key={c.value} type="button" onClick={() => changeColor(c.value)} disabled={rendering}
                        className={`px-2.5 py-1 text-sm rounded-lg border transition disabled:opacity-50 ${
                          saturation === c.value
                            ? 'border-orange bg-orange text-white'
                            : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                        }`}
                      >
                        {t(c.key)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
                </>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border shrink-0">
          {step === 2 && (
            <button
              type="button" onClick={() => setStep(1)} disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text disabled:opacity-50 transition"
            >
              <ChevronLeft size={15} /> {t('backButton')}
            </button>
          )}
          {step === 1 ? (
            /* ต้องรอ areaPixels ด้วย — auto-เลือกรูปแรกทำให้ srcUrl มาก่อนที่ Cropper จะยิง
               onCropComplete กดเร็วๆ จะเจอ error "เลือกรูปพื้นหลังก่อน" ทั้งที่เลือกให้แล้ว */
            <button
              type="button" onClick={goPreview}
              disabled={!quoteText.trim() || (!noBg && (!srcUrl || !areaPixels))}
              className="px-5 py-2 bg-orange text-white text-sm font-semibold rounded-lg hover:bg-orange-light disabled:opacity-40 transition"
            >
              {t('nextButton')}
            </button>
          ) : (
            <button
              type="button" onClick={save} disabled={saving || rendering || !previewUrl}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-orange text-white text-sm font-semibold rounded-lg hover:bg-orange-light disabled:opacity-40 transition"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? t('saving') : t('saveButton')}
            </button>
          )}
        </div>
      </div>

      {libraryOpen && (
        <AssetPickerModal
          onClose={() => setLibraryOpen(false)}
          onPick={asset => {
            setError('')
            bgPathRef.current = null      // รูปใหม่ = path เดิมใช้ไม่ได้แล้ว
            bgBlobRef.current = null
            setSrcUrl(`/api/posts/assets/${asset.id}/file`)
            setCrop({ x: 0, y: 0 })
            setZoom(1)
            setLibraryOpen(false)
          }}
        />
      )}
    </div>
  )
}
