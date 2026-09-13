'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Paperclip, X, Trash2 } from 'lucide-react'

/**
 * ไฟล์แนบของเคส — ดูรูป (lightbox) · แนบเพิ่ม · ลบทีละใบ
 *
 * ⚠️ หน้า /cases/[ref] เป็น server component → หลังแนบ/ลบต้อง `router.refresh()`
 *    ไม่งั้นรายการไฟล์ในจอค้างของเก่า (pattern เดียวกับ CaseManageActions)
 * ⚠️ `accept` ใน <input> เป็นแค่ตัวกรองในจอ — ด่านจริงอยู่ที่ allowlist ฝั่ง server (lib/caseUploads.js)
 */
export default function CaseAttachmentGallery({ refId, attachments, canEdit = false, maxFiles = 10 }) {
  const t = useTranslations('case')
  const router = useRouter()
  const images = attachments.filter(a => a.mime?.startsWith('image/'))
  const others = attachments.filter(a => !a.mime?.startsWith('image/'))
  const [openIndex, setOpenIndex] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const remaining = Math.max(0, maxFiles - attachments.length)

  const close = useCallback(() => setOpenIndex(null), [])
  const prev = useCallback(() => setOpenIndex(i => (i === null ? i : (i - 1 + images.length) % images.length)), [images.length])
  const next = useCallback(() => setOpenIndex(i => (i === null ? i : (i + 1) % images.length)), [images.length])

  useEffect(() => {
    if (openIndex === null) return
    function onKeyDown(e) {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openIndex, close, prev, next])

  async function upload(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''          // เลือกไฟล์เดิมซ้ำได้หลังลบ/ล้มเหลว
    if (files.length === 0) return

    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      const res = await fetch(`/api/case/${refId}/attachments`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('attachments.uploadFailed')); return }
      router.refresh()
    } catch {
      setError(t('attachments.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(att) {
    if (!confirm(t('attachments.deleteConfirm', { name: att.original_name || '' }))) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/case/${refId}/attachments/${att.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || t('attachments.deleteFailed'))
        return
      }
      setOpenIndex(null)
      router.refresh()
    } catch {
      setError(t('attachments.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-disc-muted">{t('attachments.none')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {images.map((a, i) => {
            const fileUrl = `/api/case/${refId}/attachments/${a.id}`
            return (
              // ปุ่มลบเป็น sibling ของปุ่มเปิดรูป ไม่ใช่ลูก — ห้ามซ้อน <button> ใน <button>
              <div key={a.id} className="relative">
                <button type="button" onClick={() => setOpenIndex(i)}
                  title={a.original_name || a.mime}
                  className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-disc-border hover:opacity-80 transition">
                  <img src={fileUrl} alt={a.original_name || ''} className="w-full h-full object-cover" />
                </button>
                {canEdit && (
                  <button type="button" onClick={() => remove(a)} disabled={busy}
                    title={t('attachments.deleteButton')}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white dark:bg-disc-hover border border-gray-200 dark:border-disc-border text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center shadow-sm transition disabled:opacity-50">
                    <X size={13} />
                  </button>
                )}
              </div>
            )
          })}
          {others.map(a => {
            const fileUrl = `/api/case/${refId}/attachments/${a.id}`
            return (
              <div key={a.id} className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-disc-border">
                <a href={fileUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline max-w-[12rem] truncate">
                  <Paperclip size={13} className="shrink-0" />
                  <span className="truncate">{a.original_name || a.mime}</span>
                </a>
                {canEdit && (
                  <button type="button" onClick={() => remove(a)} disabled={busy}
                    title={t('attachments.deleteButton')}
                    className="shrink-0 text-gray-400 hover:text-red-500 transition disabled:opacity-50">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {canEdit && (
        <div className="mt-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/ogg,application/pdf"
            onChange={upload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || remaining === 0}
            className="w-full px-4 py-2 rounded-lg border border-dashed border-gray-300 dark:border-disc-border text-sm font-semibold text-gray-600 dark:text-disc-text hover:border-orange hover:text-orange transition disabled:opacity-50 disabled:hover:border-gray-300 disabled:hover:text-gray-600"
          >
            {busy ? t('attachments.uploading') : t('attachments.addButton')}
          </button>
          {/* บอกเพดานเฉพาะตอนเต็มแล้ว — ปุ่มถูก disable ต้องมีเหตุผลกำกับ ไม่งั้นเป็น hint เปล่าๆ */}
          {remaining === 0 && (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-disc-muted">{t('attachments.full', { max: maxFiles })}</p>
          )}
          {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
        </div>
      )}

      {openIndex !== null && images[openIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
          onClick={e => e.target === e.currentTarget && close()}>
          <button onClick={close}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none">&times;</button>
          {images.length > 1 && (
            <>
              <button onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-4xl leading-none px-2">&#8249;</button>
              <button onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-4xl leading-none px-2">&#8250;</button>
            </>
          )}
          <img
            src={`/api/case/${refId}/attachments/${images[openIndex].id}`}
            alt={images[openIndex].original_name || ''}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </>
  )
}
