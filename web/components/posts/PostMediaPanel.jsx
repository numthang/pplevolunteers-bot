'use client'

// การ์ด "สื่อ" — อยู่ล่างสุดของหน้าโพสต์ กว้าง 100% (ย้ายลงมาจากคอลัมน์ขวา 2026-07-30)
//
// ที่นี่คือที่เดียวที่จัดการรูปของโพสต์แล้ว — หน้า /bot/media/basket ถูกยุบเข้ามาทั้งใบ
// ของที่ยกมาจากหน้านั้น: ปุ่ม ◀▶ เลื่อนลำดับ · รายการวิดีโอแยกจากรูป
// (หมวด/สถานะ/เจ้าของ ย้ายไป PostMetaPanel.jsx คอลัมน์ขวา)
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, Upload, Loader2, ImageOff, ChevronLeft, ChevronRight, Film, Quote, Images, GripVertical, Pencil } from 'lucide-react'
import QuoteGeneratorModal from './QuoteGeneratorModal.jsx'
import VideoQuoteModal from './VideoQuoteModal.jsx'
import AssetPickerModal from './AssetPickerModal.jsx'
import ImageEditorModal from './ImageEditorModal.jsx'

// ต้องตรงกับ EXT_BY_MIME + VIDEO_EXT_BY_MIME ใน web/lib/postsStorage.js (ฝั่ง server เช็คซ้ำอยู่แล้ว)
// ⚠️ กล่องนี้เท่านั้นที่รับวิดีโอ — คลังภาพ (`AssetPickerModal`) กับปุ่มแก้รูปยังรับเฉพาะรูป
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm'

// ไฟล์ในดิสก์ (ผ่าน gate) ก่อน · ยังโหลดไม่เสร็จ (path NULL — ปกติของสื่อจากตะกร้าดิสฯ) ใช้ CDN Discord ไปก่อน
// /api/posts/media/[id] ตอบ 404 เมื่อ path เป็น NULL → ไม่มี fallback นี้ = รูปแตกทั้งโพสต์
// `v` = กันแคช หลังแก้รูปแล้วทับไฟล์เดิม (route เสิร์ฟด้วย Cache-Control: private, max-age=3600
//  → ไม่มีตัวนี้เบราว์เซอร์โชว์รูปก่อนเบลออีก 1 ชม.) ใส่ฝั่ง client อย่างเดียว ไม่ได้มาจาก DB
const srcOf = m => (m.path ? `/api/posts/media/${m.id}${m.v ? `?v=${m.v}` : ''}` : m.source_url || null)

// compact = อยู่ในรางขวา 360px (กริดแคบ) · false = การ์ดเต็มความกว้าง
// แยกเป็น prop เพราะยังลองสลับที่วางอยู่ — ย้ายการ์ดในหน้า /posts/[id] แล้วสลับ flag ตามได้เลย
const GRID = {
  compact: 'grid grid-cols-2 gap-2',
  wide:    'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3',
}

export default function PostMediaPanel({ id, compact = false }) {
  const tq = useTranslations('posts.quoteModal')
  const tl = useTranslations('posts.library')
  const tv = useTranslations('posts.videoQuote')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [burnVideoId, setBurnVideoId] = useState(null)   // คลิปที่กำลังใส่คำคม
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)   // { src, index } — รูปที่กดดูเต็มจอ
  const [editing, setEditing] = useState(null)     // แถวสื่อที่กำลังแก้ (ครอบตัด/เบลอหน้า)
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
  const pointerRef = useRef(null)   // นิ้ว/เมาส์ที่กำลังลากอยู่ — กันนิ้วที่สองมาป่วนกลางทาง
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
    // ⚠️ คลิปไปคนละทางกับรูป: `/media` ใช้ formData() ที่อมทั้งไฟล์ใน RAM (ดีกับรูปหลายใบ)
    //    ส่วนคลิปยิง body ดิบเข้า `/media/video` ที่สตรีมลงดิสก์ — คลิป 200MB ผ่าน formData
    //    = ~400MB ต่อ request · ที่นี่ยิงทีละไฟล์เพราะ body ดิบมีไฟล์เดียวได้
    const videos = files.filter(f => f.type.startsWith('video/'))
    const images = files.filter(f => !f.type.startsWith('video/'))
    try {
      const added = []
      for (const v of videos) {
        const res = await fetch(`/api/posts/${id}/media/video`, {
          method: 'POST',
          headers: { 'Content-Type': v.type },
          body: v,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setUploadError(data.error || 'อัปโหลดคลิปไม่สำเร็จ'); return }
        added.push(data.data)
      }

      if (images.length) {
        const form = new FormData()
        images.forEach(f => form.append('files', f))
        const res = await fetch(`/api/posts/${id}/media`, { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setUploadError(data.error || 'อัปโหลดไม่สำเร็จ'); return }
        added.push(...data.data)
      }
      setMedia(prev => [...prev, ...added])
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
  // ⚠️ Number() ด้วย — id เป็น bigint จึงมาเป็น string จาก API แล้ว server ตีตกว่า "ลำดับไม่ถูกต้อง"
  //    และห้ามกลืน error เงียบๆ อีก (บั๊กนี้ซ่อนอยู่เพราะ .catch(()=>{}) เดิม)
  async function saveOrder(arr) {
    try {
      const res = await fetch(`/api/posts/${id}/media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: arr.map(m => Number(m.id)) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setUploadError(data.error || 'บันทึกลำดับไม่สำเร็จ')
        load()   // ลำดับบนจอไม่ตรงกับที่เซิร์ฟเวอร์เก็บแล้ว — ดึงของจริงกลับมา
      } else {
        setUploadError('')
      }
    } catch {
      setUploadError('บันทึกลำดับไม่สำเร็จ')
    }
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

  // ── ลากเรียง — Pointer Events ไม่ใช่ HTML5 drag-and-drop ─────────────────────
  // HTML5 DnD ไม่มีบนจอสัมผัสเลย → มือถือลากเรียงไม่ได้มาตลอด (แจ้ง 2026-08-07)
  // ลากได้จาก "ที่จับ" (⠿) จุดเดียว จะได้ไม่ชนกับการเลื่อนหน้าจอและการกดดูรูปเต็ม
  function moveTo(from, to) {
    setMedia(prev => {
      const imgs = prev.filter(m => m.kind !== 'video')
      const [moved] = imgs.splice(from, 1)
      imgs.splice(to, 0, moved)
      return [...imgs, ...prev.filter(m => m.kind === 'video')]
    })
    dragIndex.current = to
  }

  function onGripDown(e, i, mediaId) {
    if (e.button > 0) return      // เมาส์: เอาเฉพาะปุ่มซ้าย
    e.preventDefault()            // กันเบราว์เซอร์เริ่ม native drag / ลากคลุมข้อความ
    dragIndex.current = i
    pointerRef.current = e.pointerId
    setDraggingId(mediaId)
  }

  // ⛔ ห้ามใช้ setPointerCapture บนที่จับ + onLostPointerCapture ปิดการลาก (ของเดิม แล้วมัน "หลุดมือ")
  //    พอสลับลำดับสำเร็จ React ย้าย DOM node ของช่องนั้น (insertBefore = ถอดออกแล้วใส่กลับ)
  //    → เบราว์เซอร์ปล่อย pointer capture ทันที → lostpointercapture ยิง → การลากจบตั้งแต่สลับครั้งแรก
  //    ฟังที่ window แทน: DOM ในกริดจะสลับยังไงก็ไม่กระทบ event ที่วิ่งมาถึง window
  useEffect(() => {
    if (draggingId === null) return

    function onMove(e) {
      if (pointerRef.current !== null && e.pointerId !== pointerRef.current) return   // นิ้วที่สองไม่เกี่ยว
      if (dragIndex.current === null) return
      const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-media-idx]')
      if (!cell) return
      const to = Number(cell.dataset.mediaIdx)
      if (!Number.isInteger(to) || to === dragIndex.current) return
      moveTo(dragIndex.current, to)
    }
    function onEnd(e) {
      if (e && pointerRef.current !== null && e.pointerId !== pointerRef.current) return
      if (dragIndex.current === null) return
      dragIndex.current = null
      pointerRef.current = null
      setDraggingId(null)
      saveOrder(mediaRef.current)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId])

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  if (loadError) return <p className="text-red-500 text-sm">{loadError}</p>

  const canEdit = !!can.edit
  // วิดีโอเล่นในกริดรูปไม่ได้ → แยกเป็นรายการข้างล่าง (ของเดิมยัดเข้า <img> แล้วขึ้นเป็นรูปแตก)
  const images = media.filter(m => m.kind !== 'video')
  const videos = media.filter(m => m.kind === 'video')

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide">
        สื่อ ({media.length})
        {canEdit && images.length > 0 ? ' — แตะรูปเพื่อแก้ไข' : ''}
        {canEdit && images.length > 1 ? ' · ลากที่ ⠿ หรือกด ◀▶ เพื่อเรียง' : ''}
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
            หรือลากไฟล์มาวาง / คลิกแล้ววาง (Ctrl+V) · รูปไม่เกิน 12MB · คลิป 200MB (โพสต์ละ 1 คลิป)
          </p>

          {/* เครื่องมือเสริม = สร้างสื่อใหม่ ไม่ใช่อัปของที่มีอยู่ → วางเป็นปุ่มเล็กมุมขวาล่าง
              ให้เป็นรอง "เลือกไฟล์" ที่เป็นทางหลัก (ปุ่มวิดีโอจะมาต่อแถวนี้) */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <button
              onClick={() => setLibraryOpen(true)}
              title={tl('pickTitle')}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
            >
              <Images size={12} /> {tl('fromLibrary')}
            </button>
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
        <div className={`${compact ? GRID.compact : GRID.wide}${draggingId !== null ? ' select-none' : ''}`}>
          {images.map((m, i) => {
            const src = srcOf(m)
            const broken = !src || failedIds.includes(m.id)
            return (
              <div
                key={m.id}
                data-media-idx={i}
                className={`relative group aspect-[4/3] rounded-lg overflow-hidden border bg-black transition-all duration-150 ${
                  /* ห้ามย่อขนาด (scale) ตอนลาก — ช่องหดแล้วเกิดร่องว่าง จุดที่นิ้วชี้จะหลุดออกนอกช่องเป็นพักๆ */
                  draggingId === m.id ? 'opacity-40 ring-2 ring-teal border-teal' : 'border-warm-200 dark:border-disc-border'
                }`}
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
                    draggable={false}
                    // จิ้มรูป = เข้าหน้าแก้ไขเลย (กล่องแก้ไขโชว์รูปเต็มอยู่แล้ว จึงไม่ต้องมีขั้น lightbox คั่น)
                    // เหลือ lightbox ไว้เฉพาะทางที่แก้ไม่ได้: ไม่มีสิทธิ์แก้ / ไฟล์ยังไม่ลงดิสก์ (canvas taint)
                    onClick={() => (canEdit && m.path ? setEditing(m) : setLightbox({ src, index: i }))}
                    onError={() => setFailedIds(prev => (prev.includes(m.id) ? prev : [...prev, m.id]))}
                    className={`w-full h-full object-cover ${canEdit && m.path ? 'cursor-pointer' : 'cursor-zoom-in'}`}
                    title={canEdit && m.path ? 'แก้ไขรูป (ครอบตัด / เบลอหน้า)' : 'ดูรูปเต็ม'}
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
                {/* ป้าย ✏️ เป็นแค่ "ป้ายบอก" ว่าจิ้มรูปแล้วแก้ได้ — ตัวรับคลิกคือทั้งรูป ไม่ใช่ปุ่มนี้
                    (จิ้มโดนป้ายพอดีก็ยังเข้าหน้าแก้ไข เพราะ pointer-events ปล่อยทะลุลงรูป) */}
                {canEdit && !broken && m.path && (
                  <span className="absolute top-1.5 right-9 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white pointer-events-none">
                    <Pencil size={12} />
                  </span>
                )}
                {/* ที่จับสำหรับลาก — touch-none = จับแล้วหน้าจอไม่เลื่อนตาม (บนมือถือลากได้จากตรงนี้เท่านั้น) */}
                {canEdit && images.length > 1 && (
                  <button
                    onPointerDown={e => onGripDown(e, i, m.id)}
                    onContextMenu={e => e.preventDefault()}   // มือถือ: กดค้างแล้วเมนูเด้ง = ลากต่อไม่ได้
                    title="ลากเพื่อเรียงลำดับ"
                    className="absolute bottom-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition touch-none select-none cursor-grab active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
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
              <div key={v.id} className="flex flex-col gap-2 rounded-lg border border-warm-200 dark:border-disc-border p-2">
                <div className="flex items-center gap-2">
                  <Film size={16} className="shrink-0 text-warm-500 dark:text-disc-muted" />
                  <span className="flex-1 min-w-0 text-sm text-warm-700 dark:text-disc-text truncate">
                    {!src ? 'ยังโหลดไฟล์ไม่เสร็จ' : v.path ? 'คลิปในโพสต์นี้' : 'คลิป (ต้นทางบน Discord)'}
                  </span>
                  {canEdit && v.path && (
                    <button
                      onClick={() => setBurnVideoId(v.id)}
                      title={tv('title')}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                    >
                      <Quote size={12} /> {tv('title')}
                    </button>
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
                {/* preload="metadata" — ดึงแค่หัวไฟล์มาทำแถบเวลา ไม่ลากคลิปทั้งก้อนมาตอนเปิดหน้า
                    (route เสิร์ฟแบบ range/206 แล้ว จึงเลื่อน timeline ได้และ Safari ยอมเล่น) */}
                {src && (
                  <video
                    src={src}
                    controls
                    preload="metadata"
                    className="w-full max-h-64 rounded-md bg-black"
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* หยิบจากคลัง — server คัดลอกไฟล์ให้ใหม่ (ลบสื่อชิ้นนี้ทีหลังจะไม่ลากรูปในคลังหายไปด้วย) */}
      {libraryOpen && (
        <AssetPickerModal
          onClose={() => setLibraryOpen(false)}
          onPick={async asset => {
            setUploadError('')
            const res = await fetch(`/api/posts/${id}/media/from-asset`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ assetId: asset.id }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) { setUploadError(data.error || 'หยิบรูปจากคลังไม่สำเร็จ'); return }
            setMedia(prev => [...prev, data.data])
            window.dispatchEvent(new CustomEvent('posts:media-changed', { detail: { id } }))
            setLibraryOpen(false)
          }}
        />
      )}

      {/* แก้รูป — ทับไฟล์เดิม แถวเดิม ตำแหน่งเดิม จึงแค่สลับแถวใน state ไม่ต้อง reload ทั้งกอง
          ต้องใส่ v ใหม่ทุกครั้ง ไม่งั้นเบราว์เซอร์ยังโชว์รูปเก่าจากแคช (URL เดิมเป๊ะ) */}
      {editing && (
        <ImageEditorModal
          key={editing.id}                       /* พลิกรูป = เริ่ม canvas/undo ใหม่หมด */
          media={editing}
          src={srcOf(editing)}
          onClose={() => setEditing(null)}
          onNavigate={images.length > 1 ? dir => {
            const at = images.findIndex(m => String(m.id) === String(editing.id))
            const j = (at + dir + images.length) % images.length
            setEditing(images[j])
          } : null}
          onSaved={row => {
            setMedia(prev => prev.map(m => (String(m.id) === String(row.id) ? { ...row, v: Date.now() } : m)))
            window.dispatchEvent(new CustomEvent('posts:media-changed', { detail: { id } }))
          }}
        />
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

      {burnVideoId && (
        <VideoQuoteModal
          mediaId={burnVideoId}
          onClose={() => setBurnVideoId(null)}
          onDone={updated => {
            // ทับแถวเดิม (id เดิม) → ต้อง map ไม่ใช่ push · `v` = กันแคช เพราะ route เสิร์ฟด้วย
            // Cache-Control 1 ชม. ไม่งั้นเบราว์เซอร์ยังเล่นคลิปก่อนใส่คำคมต่ออีกนาน
            setMedia(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated, v: Date.now() } : m)))
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
