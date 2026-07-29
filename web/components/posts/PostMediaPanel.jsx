'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Upload, Loader2, ImageOff, Users } from 'lucide-react'

const STATUS_LABEL = { draft: 'ฉบับร่าง', review: 'รอตรวจ', approved: 'อนุมัติแล้ว' }
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

export default function PostMediaPanel({ id }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [post, setPost] = useState(null)
  const [can, setCan] = useState({})
  const [media, setMedia] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dropHover, setDropHover] = useState(false)
  const [draggingId, setDraggingId] = useState(null)
  const [promoteLoading, setPromoteLoading] = useState(false)
  const [promoteError, setPromoteError] = useState('')

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
      setPost(data.data.post)
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

  // สถานะเปลี่ยนจากคอลัมน์ซ้าย (PostEditor) — sync ป้ายสถานะโดยไม่ต้องรีโหลดทั้งก้อน
  useEffect(() => {
    function onChanged(e) {
      if (e.detail?.id !== id) return
      if (e.detail?.status) setPost(prev => (prev ? { ...prev, status: e.detail.status } : prev))
    }
    window.addEventListener('posts:changed', onChanged)
    return () => window.removeEventListener('posts:changed', onChanged)
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
  }

  function saveOrder(arr) {
    return fetch(`/api/posts/${id}/media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: arr.map(m => m.id) }),
    }).catch(() => {})
  }

  function onDragStart(i, mediaId) { dragIndex.current = i; setDraggingId(mediaId) }
  function onDragEnterCell(i) {
    const from = dragIndex.current
    if (from === null || from === i) return
    setMedia(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      return next
    })
    dragIndex.current = i
  }
  function onDragEnd() {
    setDraggingId(null)
    if (dragIndex.current !== null) saveOrder(mediaRef.current)
    dragIndex.current = null
  }

  async function handlePromote() {
    if (!confirm('เปิดร่างนี้ให้ทีมเห็น? ย้อนกลับเป็นส่วนตัวไม่ได้อีก')) return
    setPromoteLoading(true)
    setPromoteError('')
    try {
      const res = await fetch(`/api/posts/${id}/promote`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setPromoteError(data.error || 'เปิดให้ทีมเห็นไม่สำเร็จ'); return }
      setPost(data.data.post)
      load() // can.promote คำนวณจาก visibility ใหม่ — โหลดใหม่ให้ตรง
    } catch {
      setPromoteError('เปิดให้ทีมเห็นไม่สำเร็จ')
    } finally {
      setPromoteLoading(false)
    }
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  if (loadError) return <p className="text-red-500 text-sm">{loadError}</p>
  if (!post) return null

  const canEdit = !!can.edit

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-warm-700 dark:text-disc-muted uppercase tracking-wide mb-2">
          สื่อ ({media.length})
        </h2>

        {canEdit && (
          <div
            tabIndex={0}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onDragEnter={() => setDropHover(true)}
            onDragLeave={() => setDropHover(false)}
            className={`rounded-lg border border-dashed p-4 text-center mb-3 transition-colors ${
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
          </div>
        )}

        {uploadError && <p className="text-sm text-red-500 mb-2">{uploadError}</p>}

        {media.length === 0 ? (
          <div className="flex items-center gap-2 text-warm-400 dark:text-disc-muted py-4">
            <ImageOff size={18} />
            <span className="text-sm">ยังไม่มีสื่อ</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {media.map((m, i) => (
              <div
                key={m.id}
                draggable={canEdit}
                onDragStart={() => onDragStart(i, m.id)}
                onDragEnter={() => onDragEnterCell(i)}
                onDragOver={e => e.preventDefault()}
                onDragEnd={onDragEnd}
                className={`relative group aspect-square rounded-lg overflow-hidden border bg-black transition-all duration-150 ${
                  canEdit ? 'cursor-move' : ''
                } ${draggingId === m.id ? 'opacity-40 ring-2 ring-teal border-teal scale-95' : 'border-warm-200 dark:border-disc-border'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/posts/media/${m.id}`} alt={`สื่อ ${i + 1}`} className="w-full h-full object-cover" />
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
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-warm-200 dark:border-disc-border flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">หมวด</span>
          <span className="text-warm-900 dark:text-disc-text">{post.category || 'ยังไม่จัดหมวด'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">สถานะ</span>
          <span className="text-warm-900 dark:text-disc-text">{STATUS_LABEL[post.status] || post.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">เจ้าของ</span>
          <span className="text-warm-900 dark:text-disc-text">{post.owner_name || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-warm-500 dark:text-disc-muted">การมองเห็น</span>
          <span className="text-warm-900 dark:text-disc-text">{post.visibility === 'org' ? 'องค์กร' : 'ส่วนตัว'}</span>
        </div>
      </div>

      {can.promote && (
        <div>
          <button
            onClick={handlePromote}
            disabled={promoteLoading}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 disabled:opacity-40 transition"
          >
            {promoteLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            เปิดให้ทีมเห็น
          </button>
          {promoteError && <p className="text-sm text-red-500 mt-1.5">{promoteError}</p>}
        </div>
      )}
    </div>
  )
}
