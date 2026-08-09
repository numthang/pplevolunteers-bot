'use client'

// คำคมบนคลิป — หน้าจอเดียว: พิมพ์ข้อความ → เลือกตำแหน่ง → กดสร้าง
//
// ⚠️ พรีวิวคือ **PNG ตัวจริงที่จะถูกเบิร์น** วางทับ <video> ด้วย CSS ไม่ใช่ <div> ข้อความ
//    เพราะ fitFont ย่อฟอนต์ให้พอบรรทัดและตัดคำไทยแบบ grapheme-aware — CSS ให้ผลคนละอย่าง
//    แล้วสิ่งที่เห็นตอนพรีวิวจะไม่ตรงกับคลิปที่ได้ (ดู lib/videoRender.js)
//
// ⚠️ ไม่มีคิว: กดสร้างแล้ว request ค้างจนกว่า ffmpeg จะเสร็จ (คลิป 90 วิ ≈ 61 วิ)
//    จึงต้องมี beforeunload กันปิดแท็บทิ้งกลางคัน
//
// ผลลัพธ์ **ทับคลิปเดิม** (แถวเดิม id เดิม) ไม่ใช่เพิ่มชิ้นใหม่ — โพสต์หนึ่งมีคลิปได้ชิ้นเดียว
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { X, Loader2, Clapperboard } from 'lucide-react'

const POSITIONS = ['top', 'center', 'bottom']
const QUOTE_MAX = 300
const AUTHOR_MAX = 35
const AUTHOR_LS_KEY = 'posts.quoteAuthor'   // ใช้คีย์เดียวกับการ์ดคำคม — ชื่อผู้พูดคนเดียวกัน

export default function VideoQuoteModal({ mediaId, onClose, onDone }) {
  const t = useTranslations('posts.videoQuote')

  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [quoteText, setQuoteText] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [position, setPosition] = useState('bottom')
  const [overlayUrl, setOverlayUrl] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')

  const objectUrls = useRef([])
  const reqSeq = useRef(0)   // กันพรีวิวเก่ามาทับใหม่ตอนพิมพ์รัวๆ

  // ปิดได้ 3 ทาง: ปุ่ม X · ESC · คลิกนอกกล่อง (กฎ CLAUDE.md) — แต่ห้ามปิดตอนกำลัง render
  const tryClose = useCallback(() => { if (!rendering) onClose() }, [rendering, onClose])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') tryClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tryClose])

  useEffect(() => () => objectUrls.current.forEach(u => URL.revokeObjectURL(u)), [])

  // ปิดแท็บกลาง render = ffmpeg ทำงานต่อแต่ไม่มีใครรับผล (ไฟล์ครึ่งๆ ให้ gc-media.js เก็บ)
  useEffect(() => {
    if (!rendering) return
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [rendering])

  useEffect(() => {
    try { setAuthorName(localStorage.getItem(AUTHOR_LS_KEY) || '') } catch { /* ปิด storage ไว้ */ }
  }, [])

  // สเปกคลิป — ต้องรู้สัดส่วนจริงก่อน ไม่งั้นวาง overlay ทับไม่ตรง
  useEffect(() => {
    let alive = true
    fetch(`/api/posts/media/${mediaId}/quote-burn`)
      .then(async res => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!alive) return
        if (!ok) { setLoadError(body.error || t('loadFailed')); return }
        setInfo(body.data)
      })
      .catch(() => alive && setLoadError(t('loadFailed')))
    return () => { alive = false }
  }, [mediaId, t])

  // พรีวิว: หน่วงไว้ก่อนยิง — พิมพ์ทีละตัวอักษรแล้วยิงทุกครั้งคือเผา CPU เปล่า
  useEffect(() => {
    if (!info || !quoteText.trim()) { setOverlayUrl(null); return }
    const seq = ++reqSeq.current
    const timer = setTimeout(async () => {
      setPreviewing(true)
      try {
        const res = await fetch(`/api/posts/media/${mediaId}/quote-burn/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quoteText, authorName, position }),
        })
        if (seq !== reqSeq.current) return          // มีคำขอใหม่แซงแล้ว ทิ้งผลนี้
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body.error || t('previewFailed'))
          return
        }
        const url = URL.createObjectURL(await res.blob())
        objectUrls.current.push(url)
        setOverlayUrl(url)
        setError('')
      } catch {
        if (seq === reqSeq.current) setError(t('previewFailed'))
      } finally {
        if (seq === reqSeq.current) setPreviewing(false)
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [mediaId, info, quoteText, authorName, position, t])

  async function handleRender() {
    setRendering(true)
    setError('')
    try {
      const res = await fetch(`/api/posts/media/${mediaId}/quote-burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteText, authorName, position }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error || t('renderFailed')); return }
      try { localStorage.setItem(AUTHOR_LS_KEY, authorName) } catch { /* ปิด storage ไว้ */ }
      onDone?.(body.data)
      onClose()
    } catch {
      setError(t('renderFailed'))
    } finally {
      setRendering(false)
    }
  }

  const tooLong = info?.tooLong
  const canRender = !!quoteText.trim() && !!info && !tooLong && !rendering

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) tryClose() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-disc-border shrink-0">
          <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('title')}</h2>
          <button
            type="button" onClick={tryClose} disabled={rendering} title={t('closeTitle')}
            className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover disabled:opacity-40 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {loadError && <p className="text-sm text-red-500">{loadError}</p>}

          {info && (
            <>
              {/* คลิป + ชั้นข้อความจริงซ้อนทับ — ทั้งคู่ object-contain ในกล่องสัดส่วนเดียวกัน จึงตรงกันเสมอ */}
              <div
                className="relative w-full max-h-[46vh] bg-black rounded-lg overflow-hidden mx-auto"
                style={{ aspectRatio: `${info.width} / ${info.height}` }}
              >
                <video
                  src={`/api/posts/media/${mediaId}`}
                  controls
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-contain"
                />
                {overlayUrl && (
                  <img
                    src={overlayUrl}
                    alt=""
                    // pointer-events-none — ไม่งั้นบังปุ่มเล่นของ <video> ที่อยู่ข้างล่าง
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                )}
              </div>

              <p className="text-sm text-warm-500 dark:text-disc-muted">
                {t('clipInfo', { seconds: Math.round(info.duration), w: info.width, h: info.height })}
                {!info.hasAudio ? ` · ${t('noAudio')}` : ''}
                {previewing ? ` · ${t('previewing')}` : ''}
              </p>

              {tooLong && (
                <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2">
                  {t('tooLong', { max: info.maxSeconds })}
                </p>
              )}

              <div className="flex flex-col gap-1">
                <label htmlFor="vq-text" className="text-sm font-medium text-warm-700 dark:text-disc-text">
                  {t('textLabel')}
                </label>
                <textarea
                  id="vq-text"
                  value={quoteText}
                  onChange={e => setQuoteText(e.target.value.slice(0, QUOTE_MAX))}
                  rows={3}
                  placeholder={t('textPlaceholder')}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <span className="text-sm text-warm-500 dark:text-disc-muted self-end">{quoteText.length}/{QUOTE_MAX}</span>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="vq-author" className="text-sm font-medium text-warm-700 dark:text-disc-text">
                  {t('authorLabel')}
                </label>
                <input
                  id="vq-author"
                  value={authorName}
                  maxLength={AUTHOR_MAX}
                  onChange={e => setAuthorName(e.target.value)}
                  placeholder={t('authorPlaceholder')}
                  className="w-full h-9 px-3 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-warm-700 dark:text-disc-text">{t('positionLabel')}</span>
                <div className="flex gap-2">
                  {POSITIONS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPosition(p)}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                        position === p
                          ? 'border-teal bg-teal/10 text-teal'
                          : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {t(`position_${p}`)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-warm-200 dark:border-disc-border shrink-0">
          <span className="text-sm text-warm-500 dark:text-disc-muted">
            {rendering ? t('renderingHint') : t('replaceHint')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={tryClose} disabled={rendering}
              className="px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-40 transition"
            >
              {t('cancel')}
            </button>
            <button
              type="button" onClick={handleRender} disabled={!canRender}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
            >
              {rendering ? <Loader2 size={14} className="animate-spin" /> : <Clapperboard size={14} />}
              {rendering ? t('rendering') : t('render')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
