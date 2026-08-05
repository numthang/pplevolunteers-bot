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
import { QUOTE_AI_KEY, QUOTE_STYLE_OPTIONS } from '@/lib/quoteStyles.js'

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

// ชื่อ/ตำแหน่งมักเป็นค่าเดิมทุกใบ → จำค่าล่าสุดไว้ในเครื่อง (ฝั่งบอทก็จำผ่าน quote_state เหมือนกัน)
const AUTHOR_LS_KEY = 'posts.quoteAuthor'

// ค่าตั้งต้นเวลารันโหมด dev เท่านั้น — ไว้กดเทสรัวๆ โดยไม่ต้องพิมพ์ซ้ำ
// ⚠️ ห้ามให้หลุดขึ้น production (ผู้ใช้จริงต้องเจอช่องว่าง) จึงคุมด้วย NODE_ENV
const DEV_DEFAULTS = process.env.NODE_ENV === 'production'
  ? { quoteText: '', authorName: '' }
  : {
      quoteText: 'การเมืองที่ดีเริ่มจากการฟังเสียงประชาชน',
      authorName: 'ทีมสื่อ พรรคประชาชน',
    }

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

  const [quoteText, setQuoteText] = useState(DEV_DEFAULTS.quoteText)
  const [authorName, setAuthorName] = useState(DEV_DEFAULTS.authorName)
  const [aiQuotes, setAiQuotes] = useState([])

  // ── ขั้น 2: พรีวิว ────────────────────────────────────────────────────────
  const [style, setStyle] = useState(QUOTE_STYLE_OPTIONS[0].value)
  const [saturation, setSaturation] = useState('1.0')
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

  // ชื่อ/ตำแหน่งที่ใช้ล่าสุด — อ่านหลัง mount ไม่ใช่ใน useState เพราะ localStorage ไม่มีตอน SSR
  useEffect(() => {
    try {
      const last = localStorage.getItem(AUTHOR_LS_KEY)
      if (last) setAuthorName(last)
    } catch { /* โหมดส่วนตัว/ปิด storage — ไม่ใช่เรื่องคอขาดบาดตาย */ }
  }, [])

  // สื่อในโพสต์ (ไว้เลือกเป็นพื้นหลัง) + ข้อความที่ AI เคยเสนอไว้
  useEffect(() => {
    let alive = true
    fetch(`/api/posts/${postId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return
        setPostMedia((d.data?.media || []).filter(m => m.kind !== 'video' && m.path))
      })
      .catch(() => {})

    fetch(`/api/posts/${postId}/ai-suggestions`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return
        // ชุดใหม่สุดอยู่ก่อน — รวม quotes ทุกชุดแล้วตัดซ้ำ
        const all = (d.data || []).flatMap(s => s.payload?.quotes || [])
        setAiQuotes([...new Set(all.filter(Boolean))].slice(0, 12))
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
  const render = useCallback(async (styleKey, sat) => {
    const seq = ++reqSeq.current
    setRendering(true)
    setError('')
    try {
      const form = new FormData()
      if (bgPathRef.current) form.append('bgPath', bgPathRef.current)
      else form.append('bg', bgBlobRef.current, 'bg.jpg')
      form.append('quoteText', quoteText)
      form.append('authorName', authorName)
      form.append('style', styleKey)
      if (sat) form.append('saturation', sat)

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

  async function goPreview() {
    if (!srcUrl || !areaPixels) { setError(t('needBg')); return }
    if (!quoteText.trim()) { setError(t('needText')); return }
    bgBlobRef.current = await cropToBlob(srcUrl, areaPixels)   // ครอปก่อน render เสมอ
    bgPathRef.current = null
    setStep(2)
    render(style, saturation)
  }

  function changeStyle(next) {
    setStyle(next)
    render(next, saturation)
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
      if (bgPathRef.current) form.append('bgPath', bgPathRef.current)
      else form.append('bg', bgBlobRef.current, 'bg.jpg')
      form.append('quoteText', quoteText)
      form.append('authorName', authorName)
      form.append('style', style)
      form.append('saturation', saturation)

      const res = await fetch(`/api/posts/${postId}/media/quote`, { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || t('loadFailed')); return }
      // จำชื่อไว้ให้ใบถัดไป — จำเฉพาะตอนบันทึกสำเร็จ ไม่งั้นค่าที่พิมพ์เล่นแล้วยกเลิกก็ติดไปด้วย
      try { if (authorName.trim()) localStorage.setItem(AUTHOR_LS_KEY, authorName.trim()) } catch { /* ไม่มี storage ก็ช่าง */ }
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
                <input
                  ref={fileInputRef} type="file" accept={ACCEPT} className="hidden"
                  onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }}
                />
                <div className="flex flex-wrap gap-2">
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

              {srcUrl && (
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
                  maxLength={35} placeholder={t('authorPlaceholder')} className={inputCls}
                />
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

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('styleLabel')}</span>
                <select
                  value={style} onChange={e => changeStyle(e.target.value)} disabled={rendering}
                  className={inputCls + ' h-9 py-0 disabled:opacity-50'}
                >
                  {QUOTE_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  <option value={QUOTE_AI_KEY}>✨ AI</option>
                </select>
                {style === QUOTE_AI_KEY && (
                  <span className="text-sm text-warm-500 dark:text-disc-muted">{t('aiStyleNote')}</span>
                )}
              </div>

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
            <button
              type="button" onClick={goPreview} disabled={!srcUrl || !quoteText.trim()}
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
