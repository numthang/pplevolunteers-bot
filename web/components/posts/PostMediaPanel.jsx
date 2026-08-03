'use client'

// การ์ด "สื่อ" — อยู่ล่างสุดของหน้าโพสต์ กว้าง 100% (ย้ายลงมาจากคอลัมน์ขวา 2026-07-30)
//
// ที่นี่คือที่เดียวที่จัดการรูปของโพสต์แล้ว — หน้า /bot/media/basket ถูกยุบเข้ามาทั้งใบ
// ของที่ยกมาจากหน้านั้น: ปุ่ม ◀▶ เลื่อนลำดับ · รายการวิดีโอแยกจากรูป
// (หมวด/สถานะ/เจ้าของ ย้ายไป PostMetaPanel.jsx คอลัมน์ขวา)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, Upload, Loader2, ImageOff, ChevronLeft, ChevronRight, Film, Quote } from 'lucide-react'
import QuoteGeneratorModal from './QuoteGeneratorModal.jsx'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

// ไฟล์ในดิสก์ (ผ่าน gate) ก่อน · ยังโหลดไม่เสร็จ (path NULL — ปกติของสื่อจากตะกร้าดิสฯ) ใช้ CDN Discord ไปก่อน
// /api/posts/media/[id] ตอบ 404 เมื่อ path เป็น NULL → ไม่มี fallback นี้ = รูปแตกทั้งโพสต์
const srcOf = m => (m.path ? `/api/posts/media/${m.id}` : m.source_url || null)

// compact = อยู่ในรางขวา 360px (กริดแคบ) · false = การ์ดเต็มความกว้าง
// แยกเป็น prop เพราะยังลองสลับที่วางอยู่ — ย้ายการ์ดในหน้า /posts/[id] แล้วสลับ flag ตามได้เลย
const GRID = {
  compact: 'grid grid-cols-2 gap-2',
  wide:    'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3',
}

export default function PostMediaPanel({ id, compact = false }) {
  const tq = useTranslations('posts.quoteModal')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)   // { src, index } — รูปที่กดดูเต็มจอ
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [can, setCan] = useState({})
  const [media, setMedia] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dropHover, setDropHover] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [failedIds, setFailedIds] = useState([])   // ลิงก์ CDN ของ Discord หมดอายุได้ → ซ่อนรูปที่โหลดไม่ขึ้น

  const fileInputRef = useRef(null)
  const dragIndex = useRef(null)
  const mediaRef = useRef([])

  async function load() {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/posts/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(data.error || 'โหลดโพสต์ไม่สำเร็จ'); setLoading(false); return }
      setCan(data.data.can || {})
      setMedia(data.data.media || [])
    } catch {
      setLoadError('โหลดโพสต์ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => { mediaRef.current = media }, [media])

  // lightbox ปิดได้ 3 ทาง (กฎ CLAUDE.md) — ปุ่ม X + ESC + คลิกนอกรูป
  useEffect(() => {
    if (!lightbox) return
    const onKey = e => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  // สถานะเปลี่ยนจาก PostEditor (เช่น อนุมัติ → แก้ไม่ได้แล้ว) → can.edit ต้องตามไปด้วย
  useEffect(() => {
    function onChanged(e) {
      if (e.detail?.id !== id || !e.detail?.status) return
      load()
    }
    window.addEventListener('posts:changed', onChanged)
    return () => window.removeEventListener('posts:changed', onChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function uploadFiles(files) {
    if (!files.length) return
    setUploading(true)
    setUploadError('')
    const form = new FormData()
    files.forEach(f => form.append('files', f))
    try {
      const res = await fetch(`/api/posts/${id}/media`, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setUploadError(data.error || 'อัปโหลดไม่สำเร็จ'); return }
      setMedia(prev => [...prev, ...data.data])
      // การ์ด "เผยแพร่" แยกออกไปแล้ว → บอกให้มันรู้ว่าตอนนี้มีสื่อกี่ชิ้น (IG/Threads ต้องมีสื่อ)
      window.dispatchEvent(new CustomEvent('posts:media-changed', { detail: { id } }))
    } catch {
      setUploadError('อัปโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length) { e.preventDefault(); uploadFiles(files) }
  }

  function handleDrop(e) {
    e.preventDefault()
    setDropHover(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) uploadFiles(files)
  }

  async function removeMedia(mediaId) {
    setMedia(prev => prev.filter(m => m.id !== mediaId))
    await fetch(`/api/posts/media/${mediaId}`, { method: 'DELETE' }).catch(() => {})
    window.dispatchEvent(new CustomEvent('posts:media-changed', { detail: { id } }))
  }

  // ⚠️ ส่ง "ทุกชิ้น" ไม่ใช่เฉพาะรูป — reorderMedia() เขียน sort_order = ลำดับใน array ที่ส่งไป
  // ถ้าส่งแต่รูป วิดีโอจะค้าง sort_order เก่าแล้วแทรกสลับตำแหน่งกับรูป
  function saveOrder(arr) {
    return fetch(`/api/posts/${id}/media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: arr.map(m => m.id) }),
    }).catch(() => {})
  }

  // เลื่อนทีละช่อง — ของคู่กับการลาก (จอสัมผัส/เมาส์ทีเดียวไม่พลาด) ยกมาจากหน้าตะกร้าเดิม
  function move(i, dir) {
    const imgs = media.filter(m => m.kind !== 'video')
    const j = i + dir
    if (j < 0 || j >= imgs.length) return
    ;[imgs[i], imgs[j]] = [imgs[j], imgs[i]]
    const next = [...imgs, ...media.filter(m => m.kind === 'video')]
    setMedia(next)
    saveOrder(next)
  }

  function onDragStart(i, mediaId) { dragIndex.current = i; setDraggingId(mediaId) }
  function onDragEnterCell(i) {
    const from = dragIndex.current
    if (from === null || from === i) return
    setMedia(prev => {
      const imgs = prev.filter(m => m.kind !== 'video')
      const [moved] = imgs.splice(from, 1)
      imgs.splice(i, 0, moved)
      return [...imgs, ...prev.filter(m => m.kind === 'video')]
    })
    dragIndex.current = i
  }
  function onDragEnd() {
    setDraggingId(null)
    if (dragIndex.current !== null) saveOrder(mediaRef.current)
    dragIndex.current = null
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  if (loadError) return <p className="text-red-500 text-sm">{loadError}</p>

  const canEdit = !!can.edit
  // วิดีโอเล่นในกริดรูปไม่ได้ → แยกเป็นรายการข้างล่าง (ของเดิมยัดเข้า <img> แล้วขึ้นเป็นรูปแตก)
  const images = media.filter(m => m.kind !== 'video')
  const videos = media.filter(m => m.kind === 'video')

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide">
        สื่อ ({media.length}){images.length > 1 && canEdit ? ' — ลากเรียง หรือกด ◀▶' : ''}
      </h2>

      {canEdit && (
        <div
          tabIndex={0}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onDragEnter={() => setDropHover(true)}
          onDragLeave={() => setDropHover(false)}
          className={`relative rounded-lg border border-dashed p-4 pb-9 text-center transition-colors ${
            dropHover ? 'border-teal bg-warm-50' : 'border-warm-200 dark:border-disc-border'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={e => { uploadFiles(Array.from(e.target.files || [])); e.target.value = '' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            เลือกไฟล์
          </button>
          <p className="text-sm text-warm-500 dark:text-disc-muted mt-1.5">
            หรือลากไฟล์มาวาง / คลิกแล้ววาง (Ctrl+V)
          </p>

          {/* เครื่องมือเสริม = สร้างสื่อใหม่ ไม่ใช่อัปของที่มีอยู่ → วางเป็นปุ่มเล็กมุมขวาล่าง
              ให้เป็นรอง "เลือกไฟล์" ที่เป็นทางหลัก (ปุ่มวิดีโอจะมาต่อแถวนี้) */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              onClick={() => setQuoteOpen(true)}
              title={tq('openButton')}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
            >
              <Quote size={12} /> {tq('openButton')}
            </button>
          </div>
        </div>
      )}

      {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}

      {media.length === 0 ? (
        <div className="flex items-center gap-2 text-warm-400 dark:text-disc-muted py-4">
          <ImageOff size={18} />
          <span className="text-sm">ยังไม่มีสื่อ</span>
        </div>
      ) : images.length === 0 ? null : (
        <div className={compact ? GRID.compact : GRID.wide}>
          {images.map((m, i) => {
            const src = srcOf(m)
            const broken = !src || failedIds.includes(m.id)
            return (
              <div
                key={m.id}
                draggable={canEdit}
                onDragStart={() => onDragStart(i, m.id)}
                onDragEnter={() => onDragEnterCell(i)}
                onDragOver={e => e.preventDefault()}
                onDragEnd={onDragEnd}
                className={`relative group aspect-[4/3] rounded-lg overflow-hidden border bg-black transition-all duration-150 ${
                  canEdit ? 'cursor-move' : ''
                } ${draggingId === m.id ? 'opacity-40 ring-2 ring-teal border-teal scale-95' : 'border-warm-200 dark:border-disc-border'}`}
              >
                {broken ? (
                  // ไฟล์ยังไม่ถูกดึงลงดิสก์ + ลิงก์ Discord หมดอายุ — ยังลบ/เรียงได้ แค่ดูรูปไม่ได้
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-2 text-center text-warm-400 dark:text-disc-muted">
                    <ImageOff size={20} />
                    <span className="text-xs">{m.path ? 'ไฟล์หาย' : 'ยังไม่ได้โหลดไฟล์'}</span>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={src}
                    alt={`สื่อ ${i + 1}`}
                    onClick={() => setLightbox({ src, index: i })}   // กริดเป็น object-cover = เห็นไม่ครบภาพ ต้องกดดูเต็มได้
                    onError={() => setFailedIds(prev => (prev.includes(m.id) ? prev : [...prev, m.id]))}
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                )}
                <span className="absolute top-1.5 left-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-black/60 text-white text-xs font-bold">
                  {i + 1}
                </span>
                {canEdit && (
                  <button
                    onClick={() => removeMedia(m.id)}
                    title="ลบสื่อนี้"
                    className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition"
                  >
                    <X size={13} />
                  </button>
                )}
                {canEdit && images.length > 1 && (
                  <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-90">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      title="เลื่อนไปข้างหน้า"
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30 transition"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === images.length - 1}
                      title="เลื่อนไปข้างหลัง"
                      className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30 transition"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {videos.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide">
            วิดีโอ ({videos.length})
          </h3>
          {videos.map(v => {
            const src = srcOf(v)
            return (
              <div key={v.id} className="flex items-center gap-3 rounded-lg border border-warm-200 dark:border-disc-border p-2">
                <Film size={16} className="shrink-0 text-warm-500 dark:text-disc-muted" />
                {src ? (
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 text-sm text-teal hover:underline truncate"
                  >
                    {v.path ? 'เปิดวิดีโอ' : 'เปิดวิดีโอ (ต้นทางบน Discord)'}
                  </a>
                ) : (
                  <span className="flex-1 min-w-0 text-sm text-warm-400 dark:text-disc-muted">ยังโหลดไฟล์ไม่เสร็จ</span>
                )}
                {canEdit && (
                  <button
                    onClick={() => removeMedia(v.id)}
                    title="ลบวิดีโอนี้"
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-warm-400 dark:text-disc-muted hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {quoteOpen && (
        <QuoteGeneratorModal
          postId={id}
          onClose={() => setQuoteOpen(false)}
          onSaved={media => {
            setMedia(prev => [...prev, media])
            // กล่อง "เผยแพร่" นับสื่อเอง (IG/Threads ต้องมีสื่อ ≥1) — ต้องบอกให้รู้เหมือนตอนอัปไฟล์
            window.dispatchEvent(new CustomEvent('posts:media-changed', { detail: { id } }))
          }}
        />
      )}

      {/* ดูรูปเต็ม — ปิดได้ 3 ทาง: ปุ่ม X · ESC · คลิกพื้นหลัง (กฎ CLAUDE.md)
          ◀▶ ที่นี่ = "เลื่อนดูรูปถัดไป" คนละเรื่องกับ ◀▶ บนกริดที่เป็นการสลับลำดับ */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
          onClick={e => { if (e.target === e.currentTarget) setLightbox(null) }}
        >
          <button
            onClick={() => setLightbox(null)}
            title="ปิด (ESC)"
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
          >
            <X size={18} />
          </button>
          {images.length > 1 && (
            <>
              <button
                onClick={() => { const j = (lightbox.index - 1 + images.length) % images.length; setLightbox({ src: srcOf(images[j]), index: j }) }}
                className="absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() => { const j = (lightbox.index + 1) % images.length; setLightbox({ src: srcOf(images[j]), index: j }) }}
                className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
              >
                <ChevronRight size={20} />
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 text-white text-xs tabular-nums">
                {lightbox.index + 1} / {images.length}
              </span>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.src} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
