'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Trash2, Upload, ImageIcon, X, Star } from 'lucide-react'
import { useTranslations } from 'next-intl'

// ลายน้ำส่วนตัว — ยกมาจาก PersonalPanel ใน components/config/WatermarkPanel.jsx (2026-08-10)
// อยู่ใต้ /profile/settings/brand — ของที่ตามคนข้าม org (ไม่ใช่ /org/settings/brand ที่เป็นของแบรนด์องค์กร)
// ตอนย้ายลายน้ำออกจาก guild · ไฟล์เก็บที่ assets/watermark/user_<users.id>/ (ไม่ใช่ Discord ID แล้ว)
//
// แยกถังกับลายน้ำขององค์กรเด็ดขาด (เคาะ 2026-08-10): ที่นี่เห็นเฉพาะของตัวเอง
// จะใช้ลายน้ำขององค์กรต้องสลับไปโหมดองค์กรตอนโพสต์
const PERSONAL_MAX = 10

const stripExt = name => name.replace(/\.[^.]+$/, '').replace(/^\d+-/, '')

export default function PersonalWatermarks() {
  const t = useTranslations('profile')
  const fileRef = useRef(null)
  const [files,      setFiles]      = useState([])
  const [defaultWm,  setDefaultWm]  = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [deleting,   setDeleting]   = useState(null)
  const [settingDef, setSettingDef] = useState(false)
  const [error,      setError]      = useState(null)
  const [dragging,   setDragging]   = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/watermark/personal')
    if (res.ok) {
      const d = await res.json()
      setFiles(d.files || [])
      setDefaultWm(d.default || null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function setPersonalDefault(filename) {
    const next = filename ? `personal:${filename}` : 'none'
    setSettingDef(true)
    await fetch('/api/watermark/personal', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_watermark: next }),
    })
    setDefaultWm(next === 'none' ? null : next)
    setSettingDef(false)
  }

  async function upload(file) {
    if (!file) return
    setError(null); setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/watermark/personal', { method: 'POST', body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || t('brand.uploadError'))
    else await load()
    setUploading(false)
  }

  async function remove(filename) {
    if (!confirm(t('brand.deleteConfirm', { file: filename }))) return
    setDeleting(filename)
    await fetch(`/api/watermark/personal/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    setFiles(prev => prev.filter(f => f !== filename))
    setDeleting(null)
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }

  if (loading) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('brand.loading')}</p>

  const canUpload = files.length < PERSONAL_MAX && !uploading

  return (
    <>
      <p className="mb-4 text-sm text-gray-500 dark:text-disc-muted">{t('brand.description')}</p>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={e => upload(e.target.files?.[0])} disabled={!canUpload} />

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-3 opacity-60 hover:opacity-100" aria-label={t('brand.dismissError')}><X size={14} /></button>
        </div>
      )}

      <p className="mb-3 text-xs text-gray-400 dark:text-disc-muted">
        {t('brand.count', { used: files.length, max: PERSONAL_MAX })}
        {uploading && <span className="ml-2 font-medium text-orange">{t('brand.uploading')}</span>}
        {!uploading && files.length >= PERSONAL_MAX && <span className="ml-2">{t('brand.full', { max: PERSONAL_MAX })}</span>}
      </p>

      {/* ⚠️ ยังไม่มีไฟล์ = ตารางไม่ถูก render → ต้องมีปุ่มอัปโหลดของตัวเอง ไม่งั้นตันสนิท
          (ตั้งแต่ยกกล่อง dropzone ใหญ่ออก 2026-08-10) */}
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => canUpload && fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 text-gray-400 transition dark:text-disc-muted ${
            dragging ? 'border-orange bg-orange/5 dark:bg-orange/10' : 'border-warm-300 hover:border-orange dark:border-disc-border dark:hover:border-orange'
          }`}
        >
          <Upload size={24} />
          <span className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('brand.dropHint')}</span>
          <span className="text-xs">{t('brand.fileHint')}</span>
        </button>
      ) : (
        <>
          {defaultWm && (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              ⭐ {t('brand.currentDefault', { file: stripExt(defaultWm.replace('personal:', '')) })}
            </p>
          )}
          {/* ตารางเป็นตัวรับลากวางเอง — เดิมมีกล่อง dropzone ใหญ่แยกอีกอัน ซึ่งซ้ำกับปุ่ม
              Upload ในตาราง (เรียก fileRef.click() ตัวเดียวกัน) เลยยกออก 2026-08-10 */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`grid grid-cols-2 gap-3 rounded-xl sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${
              dragging ? 'outline-dashed outline-2 outline-offset-4 outline-orange' : ''
            }`}
          >
            {files.map(filename => {
              const isDefault = defaultWm === `personal:${filename}`
              return (
                <div key={filename} className={`group relative overflow-hidden rounded-xl border bg-card-bg transition ${isDefault ? 'border-amber-400 dark:border-amber-500' : 'border-warm-200 dark:border-disc-border'}`}>
                  <div className="flex aspect-square items-center justify-center bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3 dark:bg-[repeating-conic-gradient(#2a2d31_0%_25%,transparent_0%_50%)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/watermark/personal/${encodeURIComponent(filename)}`} alt={stripExt(filename)}
                      className="max-h-24 max-w-full object-contain"
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                    <div className="hidden items-center justify-center"><ImageIcon size={32} className="text-gray-300 dark:text-disc-muted" /></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <p className="truncate text-xs font-medium text-gray-700 dark:text-disc-text" title={filename}>{stripExt(filename)}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setPersonalDefault(isDefault ? null : filename)}
                        disabled={settingDef}
                        title={isDefault ? t('brand.unsetDefault') : t('brand.setDefault')}
                        className={`rounded p-1 transition disabled:opacity-40 ${isDefault ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-disc-muted hover:text-amber-400'}`}>
                        <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                      </button>
                      <button onClick={() => remove(filename)} disabled={deleting === filename}
                        title={t('brand.delete')}
                        className="rounded p-1 text-red-400 transition hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-900/30">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {canUpload && (
              <button onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-warm-300 text-gray-400 transition hover:border-orange hover:text-orange dark:border-disc-border dark:text-disc-muted dark:hover:border-orange">
                <Upload size={24} />
                <span className="text-xs">{t('brand.upload')}</span>
                <span className="px-2 text-center text-[10px] leading-tight text-gray-400 dark:text-disc-muted">{t('brand.fileHint')}</span>
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
