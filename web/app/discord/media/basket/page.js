'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Trash2, X, Check, Loader2, ImageOff, ArrowLeft } from 'lucide-react'

export default function BasketPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const guild   = params.get('guild')
  const channel = params.get('channel')
  const chName  = params.get('name')

  const [images, setImages]   = useState([])
  const [videos, setVideos]   = useState([])
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingCap, setSavingCap] = useState(false)
  const [savedCap, setSavedCap]   = useState(false)
  const [error, setError]     = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const dragIndex = useRef(null)   // live index ของรูปที่กำลังลาก
  const imagesRef = useRef([])     // mirror ของ images ล่าสุด (ใช้ persist ตอน drag จบ)
  const capRef    = useRef(null)

  function autoGrow(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const load = useCallback(async () => {
    if (!guild || !channel) { setError('ลิงก์ไม่ครบ (ต้องมี guild + channel)'); setLoading(false); return }
    const res = await fetch(`/api/discord/basket?guild=${guild}&channel=${channel}`)
    if (!res.ok) { setError('โหลดตะกร้าไม่สำเร็จ'); setLoading(false); return }
    const d = await res.json()
    setImages(d.images || [])
    setVideos(d.videos || [])
    setCaption(d.caption || '')
    setLoading(false)
  }, [guild, channel])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') load()
  }, [status, load, router])

  // caption box โตตามเนื้อหาหลังโหลดเสร็จ
  useEffect(() => { autoGrow(capRef.current) }, [loading, caption])
  // sync mirror ของ images ไว้ persist ตอน drag จบ
  useEffect(() => { imagesRef.current = images }, [images])

  function saveOrder(arr) {
    return fetch('/api/discord/basket', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild, channel, action: 'reorder', order: arr.map(im => im.id) }),
    }).catch(() => {})
  }

  function persistOrder(next) {
    setImages(next)
    saveOrder(next)
  }

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= images.length) return
    const next = [...images]
    ;[next[i], next[j]] = [next[j], next[i]]
    persistOrder(next)
  }

  // ─── drag: live reflow — รูปอื่นขยับหลบให้เห็นว่าจะไปลงตรงไหน ───
  function onDragStart(i, id) { dragIndex.current = i; setDraggingId(id) }
  function onDragEnterCell(i) {
    const from = dragIndex.current
    if (from === null || from === i) return
    setImages(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      return next
    })
    dragIndex.current = i
  }
  function onDragEnd() {
    setDraggingId(null)
    if (dragIndex.current !== null) saveOrder(imagesRef.current)
    dragIndex.current = null
  }

  async function removeImage(id) {
    setImages(prev => prev.filter(im => im.id !== id))
    await fetch(`/api/discord/basket?guild=${guild}&channel=${channel}&id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  async function saveCaption() {
    setSavingCap(true); setSavedCap(false)
    const res = await fetch('/api/discord/basket', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild, channel, action: 'caption', caption }),
    })
    setSavingCap(false)
    if (res.ok) { setSavedCap(true); setTimeout(() => setSavedCap(false), 1500) }
  }

  async function clearBasket() {
    if (!confirm('ล้างตะกร้าทั้งหมด? (รูป + วิดีโอ + caption)')) return
    await fetch(`/api/discord/basket?guild=${guild}&channel=${channel}`, { method: 'DELETE' })
    setImages([]); setVideos([]); setCaption('')
  }

  if (status === 'loading' || loading) {
    return <p className="text-gray-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (error) {
    return <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
  }

  const empty = !images.length && !videos.length && !caption

  return (
    <div>
      <div className="mb-6">
        {guild && channel && (
          <a href={`https://discord.com/channels/${guild}/${channel}`}
            className="inline-flex items-center gap-1.5 text-sm text-teal hover:underline mb-2">
            <ArrowLeft size={14} /> กลับไป{chName ? ` #${chName}` : 'ตะกร้าใน Discord'}
          </a>
        )}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">🧺 ตะกร้าสื่อ</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">
          เรียงลำดับรูปและแก้ caption แล้วกลับไปกด <b>สร้างโพสต์</b> ใน Discord
        </p>
      </div>

      {empty ? (
        <div className="bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-8 text-center">
          <ImageOff size={32} className="mx-auto text-gray-300 dark:text-disc-muted mb-2" />
          <p className="text-sm text-gray-500 dark:text-disc-muted">ตะกร้าว่างเปล่า</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* รูป — grid เรียงลำดับได้ (ลากบน desktop / ◀▶ บนมือถือ) */}
          {images.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide mb-2">
                รูป ({images.length}) — ลากเรียง หรือกด ◀▶
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {images.map((im, i) => (
                  <div
                    key={im.id}
                    draggable
                    onDragStart={() => onDragStart(i, im.id)}
                    onDragEnter={() => onDragEnterCell(i)}
                    onDragOver={e => e.preventDefault()}
                    onDragEnd={onDragEnd}
                    className={`relative group aspect-[4/3] rounded-xl overflow-hidden border bg-black cursor-move transition-all duration-150 ${
                      draggingId === im.id
                        ? 'opacity-40 ring-2 ring-teal border-teal scale-95'
                        : 'border-warm-200 dark:border-disc-border'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={im.url} alt={`รูป ${i + 1}`} className="w-full h-full object-cover" />

                    <span className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white text-xs font-bold">{i + 1}</span>
                    <button onClick={() => removeImage(im.id)} title="ลบรูปนี้"
                      className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition">
                      <X size={15} />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-90">
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนไปก่อนหน้า"
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30 transition">
                        <ChevronLeft size={16} />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === images.length - 1} title="เลื่อนไปถัดไป"
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30 transition">
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* วิดีโอ — read-only */}
          {videos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide mb-2">
                วิดีโอ ({videos.length})
              </h2>
              <div className="flex flex-col gap-2">
                {videos.map(v => (
                  <div key={v.id} className="flex items-center gap-3 bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-2">
                    <span className="shrink-0">🎬</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-400 dark:text-disc-muted font-mono truncate">{v.url}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Caption */}
          <div>
            <label className="block text-sm font-medium text-gray-600 dark:text-disc-muted mb-1">Caption</label>
            <textarea
              ref={capRef}
              value={caption}
              onChange={e => { setCaption(e.target.value); autoGrow(e.target) }}
              rows={3}
              placeholder="ใส่ caption..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal resize-none overflow-hidden"
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button onClick={saveCaption} disabled={savingCap}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
                {savingCap ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                บันทึก caption
              </button>
              {savedCap && <span className="text-sm text-green-600 dark:text-green-400">บันทึกแล้ว</span>}
              {guild && channel && (
                <a href={`https://discord.com/channels/${guild}/${channel}`}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-gray-900 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover transition ml-auto">
                  <ArrowLeft size={14} /> กลับไปตะกร้าบน Discord
                </a>
              )}
            </div>
          </div>

          {/* ล้าง */}
          <div className="pt-2 border-t border-warm-200 dark:border-disc-border">
            <button onClick={clearBasket}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
              <Trash2 size={14} /> ล้างตะกร้าทั้งหมด
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
