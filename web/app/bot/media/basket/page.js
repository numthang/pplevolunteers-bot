'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import { ChevronLeft, ChevronRight, Trash2, X, Check, Loader2, ImageOff, ArrowLeft, Pencil, ShoppingBasket } from 'lucide-react'

// ─── List view — แสดงตะกร้าทั้งหมดใน guild ───────────────────────────────────

function BasketList() {
  const { status } = useSession()
  const router = useRouter()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/bot/baskets')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setData(d); else setError(d.error || 'โหลดไม่สำเร็จ') })
      .catch(() => setError('โหลดไม่สำเร็จ'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') {
      load()
      window.addEventListener('guild-switched', load)
      return () => window.removeEventListener('guild-switched', load)
    }
  }, [status, load, router])

  if (status !== 'authenticated' || loading) {
    return <p className="text-gray-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (error) {
    return <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
  }

  const baskets = data?.baskets || []

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">🧺 ตะกร้าสื่อ</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">ตะกร้าสื่อที่มีอยู่ใน guild นี้</p>
      </div>

      {baskets.length === 0 ? (
        <div className="bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-10 text-center">
          <ShoppingBasket size={32} className="mx-auto text-gray-300 dark:text-disc-muted mb-2" />
          <p className="text-sm text-gray-500 dark:text-disc-muted">ยังไม่มีตะกร้า — เพิ่มรูปจาก Discord ก่อน</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {baskets.map(b => (
            <BasketRow key={b.channel_id} basket={b} guildId={data.guildId} />
          ))}
        </div>
      )}
    </div>
  )
}

function BasketRow({ basket, guildId }) {
  const editUrl  = `/bot/media/basket?guild=${guildId}&channel=${basket.channel_id}&name=${encodeURIComponent(basket.channel_name || '')}`
  const vidCount = Number(basket.video_count)
  const caption  = basket.caption?.trim()
  const name     = basket.channel_name || basket.channel_id
  const thumbs   = basket.thumbnails || []

  return (
    <a href={editUrl}
      className="block bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-3 hover:border-orange/50 dark:hover:border-orange/50 transition group">
      {/* Header: ชื่อ thread + วันที่ */}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-disc-text truncate group-hover:text-orange transition">
          #{name}
        </p>
        <span className="shrink-0 text-xs text-gray-400 dark:text-disc-muted">
          {new Date(basket.last_added).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <Pencil size={14} className="shrink-0 text-gray-300 dark:text-disc-muted group-hover:text-orange transition" />
      </div>

      {/* Thumbnails (กลาง) — แสดงทุกรูปเรียงแนวนอน */}
      {thumbs.length > 0 ? (
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
          {thumbs.map((url, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={i} src={url} alt=""
              className="shrink-0 w-14 h-14 rounded-md object-cover border border-warm-200 dark:border-disc-border" />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 mt-2 text-gray-300 dark:text-disc-muted">
          <ImageOff size={16} />
          <span className="text-xs">{vidCount > 0 ? 'วิดีโอเท่านั้น' : 'ไม่มีรูป'}</span>
        </div>
      )}

      {/* Caption (ล่าง, quote ตัดสั้น) */}
      {caption && (
        <p className="mt-2 text-xs italic text-gray-500 dark:text-disc-muted border-l-2 border-warm-200 dark:border-disc-border pl-2 truncate">
          “{caption.slice(0, 120)}{caption.length > 120 ? '…' : ''}”
        </p>
      )}
    </a>
  )
}

// ─── Detail view — ตะกร้าของ channel นั้น (เดิม) ─────────────────────────────

function BasketDetail({ guild, channel, chName }) {
  const { data: session, status } = useSession()
  const { access, superAdmin } = useEffectiveRoles(session)
  const canManage = superAdmin || can('manageBasket', access?.permissions || [])
  const router = useRouter()

  const [images, setImages]   = useState([])
  const [videos, setVideos]   = useState([])
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingCap, setSavingCap] = useState(false)
  const [savedCap, setSavedCap]   = useState(false)
  const [error, setError]     = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const dragIndex = useRef(null)
  const imagesRef = useRef([])
  const capRef       = useRef(null)
  const autoSaveTimer = useRef(null)
  const isFirstLoad   = useRef(true)

  function autoGrow(el) {
    if (!el) return
    const scrollY = window.scrollY
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    window.scrollTo({ top: scrollY, behavior: 'instant' })
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/bot/basket?guild=${guild}&channel=${channel}`)
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

  useEffect(() => { autoGrow(capRef.current) }, [loading, caption])

  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(saveCaption, 1000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [caption])

  useEffect(() => { imagesRef.current = images }, [images])

  function saveOrder(arr) {
    return fetch('/api/bot/basket', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild, channel, action: 'reorder', order: arr.map(im => im.id) }),
    }).catch(() => {})
  }

  function persistOrder(next) { setImages(next); saveOrder(next) }

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= images.length) return
    const next = [...images]
    ;[next[i], next[j]] = [next[j], next[i]]
    persistOrder(next)
  }

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
    await fetch(`/api/bot/basket?guild=${guild}&channel=${channel}&id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  async function removeVideo(id) {
    setVideos(prev => prev.filter(v => v.id !== id))
    await fetch(`/api/bot/basket?guild=${guild}&channel=${channel}&id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  async function saveCaption() {
    setSavingCap(true); setSavedCap(false)
    const res = await fetch('/api/bot/basket', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild, channel, action: 'caption', caption }),
    })
    setSavingCap(false)
    if (res.ok) { setSavedCap(true); setTimeout(() => setSavedCap(false), 1500) }
  }

  async function clearBasket() {
    if (!confirm('ล้างตะกร้าทั้งหมด? (รูป + วิดีโอ + caption)')) return
    await fetch(`/api/bot/basket?guild=${guild}&channel=${channel}`, { method: 'DELETE' })
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
        <a href="/bot/media/basket"
          className="inline-flex items-center gap-1.5 text-sm text-teal hover:underline mb-2">
          <ArrowLeft size={14} /> ตะกร้าทั้งหมด
        </a>
        {guild && channel && (
          <a href={`https://discord.com/channels/${guild}/${channel}`}
            className="inline-flex items-center gap-1.5 text-sm text-teal hover:underline mb-2 ml-4">
            ↗ {chName ? `#${chName}` : 'เปิดใน Discord'}
          </a>
        )}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">🧺 ตะกร้าสื่อ</h1>
        {chName && <p className="text-sm text-gray-500 dark:text-disc-muted mt-0.5">#{chName}</p>}
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
          {images.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide mb-2">
                รูป ({images.length}) — ลากเรียง หรือกด ◀▶
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {images.map((im, i) => (
                  <div
                    key={im.id}
                    draggable={canManage}
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
                    {canManage && (
                      <button onClick={() => removeImage(im.id)} title="ลบรูปนี้"
                        className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition">
                        <X size={15} />
                      </button>
                    )}
                    {canManage && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 opacity-90">
                        <button onClick={() => move(i, -1)} disabled={i === 0}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30 transition">
                          <ChevronLeft size={16} />
                        </button>
                        <button onClick={() => move(i, 1)} disabled={i === images.length - 1}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 disabled:opacity-30 transition">
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    {canManage && (
                      <button onClick={() => removeVideo(v.id)}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-base font-semibold text-gray-700 dark:text-disc-text mb-1.5">Caption</label>
            <textarea
              ref={capRef}
              value={caption}
              onChange={e => { setCaption(e.target.value); autoGrow(e.target) }}
              rows={3}
              readOnly={!canManage}
              placeholder={canManage ? 'ใส่ caption...' : ''}
              className="w-full px-3 py-2 text-lg rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal resize-none overflow-hidden read-only:opacity-70"
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {canManage && (
                <button onClick={saveCaption} disabled={savingCap}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
                  {savingCap ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  บันทึก caption
                </button>
              )}
              {savedCap && <span className="text-sm text-green-600 dark:text-green-400">บันทึกแล้ว</span>}
              {guild && channel && (
                <a href={`https://discord.com/channels/${guild}/${channel}`}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-gray-900 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover transition ml-auto">
                  <ArrowLeft size={14} /> กลับไปตะกร้าบน Discord
                </a>
              )}
            </div>
          </div>

          {canManage && (
            <div className="pt-2 border-t border-warm-200 dark:border-disc-border">
              <button onClick={clearBasket}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                <Trash2 size={14} /> ล้างตะกร้าทั้งหมด
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default function BasketPage() {
  const params  = useSearchParams()
  const channel = params.get('channel')
  const guild   = params.get('guild')
  const chName  = params.get('name')

  if (channel && guild) return <BasketDetail guild={guild} channel={channel} chName={chName} />
  return <BasketList />
}
