'use client'

/**
 * CardAttachmentsBox — รูป/ไฟล์แนบของการ์ด 1 ใบ (สูงสุด 4 ตามที่ตกลงตอนออกแบบ import กระทู้)
 *
 * ⚠️ ไฟล์เก็บนอก /public — src ของรูปคือ API `/api/kanban/cards/<id>/attachments/<attId>`
 *    ที่เช็คสิทธิ์ทุกครั้ง (ห้ามเปลี่ยนไปชี้ static path เพื่อความเร็ว)
 * ⚠️ ไม่แตะ card.updated_at → ไม่ต้องส่ง lockToken และไม่ทำให้ autosave ช่องพิมพ์โดน 409
 * ⭐ ใช้ ImageLightbox ตัวกลาง — ห้ามเขียน lightbox ซ้ำในไฟล์นี้
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import ImageLightbox from '../ImageLightbox.jsx'

const MAX_FILES = 4

export default function CardAttachmentsBox({ cardId, readOnly, onError, t }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(null)
  const inputRef = useRef(null)

  const base = `/api/kanban/cards/${cardId}/attachments`

  const load = useCallback(async () => {
    try {
      const res = await fetch(base)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setItems(data.attachments || [])
    } catch {
      // เงียบไว้ — กล่องนี้เป็นของเสริม ล้มแล้วไม่ควรบังทั้งการ์ด
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => { load() }, [load])

  const upload = async (files) => {
    if (!files.length) return
    setBusy(true)
    try {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      const res = await fetch(base, { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(data.error || t('attachments.uploadFailed')); return }
      setItems(data.attachments || [])
    } catch {
      onError?.(t('attachments.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (attId) => {
    setBusy(true)
    try {
      const res = await fetch(`${base}/${attId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(data.error || t('attachments.deleteFailed')); return }
      setItems(data.attachments || [])
      setPreviewIdx(null)
    } catch {
      onError?.(t('attachments.deleteFailed'))
    } finally {
      setBusy(false)
    }
  }

  // ไม่มีรูปและแนบไม่ได้ = ไม่ต้องกินที่ในการ์ด
  if (loading || (!items.length && readOnly)) return null

  const full = items.length >= MAX_FILES

  return (
    <div className="border-t border-warm-200 dark:border-disc-border pt-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-base text-warm-500 dark:text-disc-muted">{t('attachments.title')}</span>
        <span className="text-xs text-warm-400 dark:text-disc-muted">{items.length}/{MAX_FILES}</span>
        {busy && <Loader2 size={14} className="animate-spin text-warm-400 dark:text-disc-muted" />}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
        {items.map((att, i) => (
          <div
            key={att.id}
            className="relative group rounded-lg overflow-hidden border border-warm-200 dark:border-disc-border aspect-square bg-warm-100 dark:bg-disc-hover"
          >
            <img
              src={`${base}/${att.id}`}
              alt={att.original_name || t('attachments.imageAlt', { n: i + 1 })}
              onClick={() => setPreviewIdx(i)}
              className="w-full h-full object-cover cursor-zoom-in"
            />
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(att.id)}
                disabled={busy}
                aria-label={t('attachments.remove')}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}

        {!readOnly && !full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-dashed border-warm-200 dark:border-disc-border aspect-square flex flex-col items-center justify-center gap-1 text-warm-400 dark:text-disc-muted hover:border-teal hover:text-teal transition"
          >
            <ImagePlus size={18} />
            <span className="text-xs">{t('attachments.add')}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => { upload([...(e.target.files || [])]); e.target.value = '' }}
      />

      <ImageLightbox
        items={items.map((a, i) => ({
          src: `${base}/${a.id}`,
          alt: a.original_name || t('attachments.imageAlt', { n: i + 1 }),
        }))}
        index={previewIdx}
        onIndex={setPreviewIdx}
        onClose={() => setPreviewIdx(null)}
      />
    </div>
  )
}
