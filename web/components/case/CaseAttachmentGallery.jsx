'use client'

import { useState, useEffect, useCallback } from 'react'

export default function CaseAttachmentGallery({ refId, attachments }) {
  const images = attachments.filter(a => a.mime?.startsWith('image/'))
  const others = attachments.filter(a => !a.mime?.startsWith('image/'))
  const [openIndex, setOpenIndex] = useState(null)

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

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {images.map((a, i) => {
          const fileUrl = `/api/case/${refId}/attachments/${a.id}`
          return (
            <button key={a.id} type="button" onClick={() => setOpenIndex(i)}
              title={a.original_name || a.mime}
              className="block w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-disc-border hover:opacity-80 transition">
              <img src={fileUrl} alt={a.original_name || ''} className="w-full h-full object-cover" />
            </button>
          )
        })}
        {others.map(a => {
          const fileUrl = `/api/case/${refId}/attachments/${a.id}`
          return (
            <a key={a.id} href={fileUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-disc-border text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
              📎 {a.original_name || a.mime}
            </a>
          )
        })}
      </div>

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
