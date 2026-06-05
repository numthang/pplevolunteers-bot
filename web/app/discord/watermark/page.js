'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload, ImageIcon, X } from 'lucide-react'

const MAX_FILES = 10

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+-/, '')
}

export default function WatermarkPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const fileRef = useRef(null)

  const [files,    setFiles]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error,    setError]    = useState(null)
  const [dragging, setDragging] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/watermark/personal')
    if (res.ok) setFiles(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') load()
  }, [status, load, router])

  async function upload(file) {
    if (!file) return
    setError(null)
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/watermark/personal', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'อัปโหลดไม่สำเร็จ')
    } else {
      await load()
    }
    setUploading(false)
  }

  async function remove(filename) {
    if (!confirm(`ลบ "${filename}"?`)) return
    setDeleting(filename)
    await fetch(`/api/watermark/personal/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    setFiles(prev => prev.filter(f => f !== filename))
    setDeleting(null)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }

  if (status === 'loading' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  const canUpload = files.length < MAX_FILES && !uploading

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">ลายน้ำของฉัน</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">
          รูปลายน้ำส่วนตัว ใช้ได้กับทุก guild — แสดงขึ้นก่อนลายน้ำของ guild เมื่อใช้คำสั่ง bot
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => canUpload && fileRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-colors ${
          canUpload ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
        } ${
          dragging
            ? 'border-orange bg-orange/5 dark:bg-orange/10'
            : 'border-warm-300 dark:border-disc-border hover:border-orange dark:hover:border-orange bg-white dark:bg-disc-hover'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => upload(e.target.files?.[0])}
          disabled={!canUpload}
        />
        <Upload size={28} className="mx-auto mb-3 text-gray-400 dark:text-disc-muted" />
        {uploading ? (
          <p className="text-sm text-orange font-medium">กำลังอัปโหลด...</p>
        ) : files.length >= MAX_FILES ? (
          <p className="text-sm text-gray-500 dark:text-disc-muted">ครบ {MAX_FILES} ไฟล์แล้ว ลบไฟล์เก่าก่อนอัปโหลดใหม่</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700 dark:text-disc-text">วางรูปที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
            <p className="text-xs text-gray-400 dark:text-disc-muted mt-1">PNG / JPG / WebP — ไม่เกิน 5 MB</p>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100 ml-3"><X size={14} /></button>
        </div>
      )}

      {/* File count */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 dark:text-disc-muted">{files.length} / {MAX_FILES} ไฟล์</span>
      </div>

      {/* Grid */}
      {files.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-disc-muted text-center py-8">ยังไม่มีลายน้ำ</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {files.map(filename => (
            <div key={filename} className="group relative bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border overflow-hidden">
              {/* Preview */}
              <div className="aspect-square bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#2a2d31_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex items-center justify-center p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/watermark/personal/${encodeURIComponent(filename)}`}
                  alt={stripExt(filename)}
                  className="max-h-24 max-w-full object-contain"
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                />
                <div className="hidden items-center justify-center">
                  <ImageIcon size={32} className="text-gray-300 dark:text-disc-muted" />
                </div>
              </div>

              {/* Filename + delete */}
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-700 dark:text-disc-text truncate" title={filename}>
                  {stripExt(filename)}
                </p>
                <button
                  onClick={() => remove(filename)}
                  disabled={deleting === filename}
                  className="shrink-0 p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          {/* Upload shortcut card */}
          {canUpload && (
            <button
              onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-warm-300 dark:border-disc-border hover:border-orange dark:hover:border-orange text-gray-400 dark:text-disc-muted hover:text-orange transition flex flex-col items-center justify-center gap-2"
            >
              <Upload size={24} />
              <span className="text-xs">อัปโหลด</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
