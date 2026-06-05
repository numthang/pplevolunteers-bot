'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload, ImageIcon, X, Server } from 'lucide-react'

const MAX_FILES = 15
const ROOT = '' // โฟลเดอร์ลายน้ำกลางของ guild

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+-/, '')
}

export default function GuildWatermarkPage() {
  const { status } = useSession()
  const router  = useRouter()
  const fileRef = useRef(null)

  const [guilds,  setGuilds]  = useState([])
  const [guildId, setGuildId] = useState('')
  const [groups,  setGroups]  = useState([])
  const [filesByGroup, setFilesByGroup] = useState({})
  const [target,  setTarget]  = useState(ROOT) // '' = guild กลาง, หรือชื่อกลุ่ม
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error,    setError]    = useState(null)
  const [dragging, setDragging] = useState(false)

  // โหลดรายการ guild ที่จัดการได้
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    fetch('/api/discord/guild-watermarks')
      .then(r => r.json())
      .then(d => {
        const gs = d.guilds || []
        setGuilds(gs)
        if (gs.length) setGuildId(gs[0].guild_id)
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [status, router])

  // โหลดไฟล์ของ guild ที่เลือก
  const loadFiles = useCallback(async (gid) => {
    if (!gid) return
    setLoading(true)
    const res = await fetch(`/api/discord/guild-watermarks?guild_id=${gid}`)
    if (res.ok) {
      const d = await res.json()
      setGroups(d.groups || [])
      setFilesByGroup(d.files || {})
    }
    setTarget(ROOT)
    setLoading(false)
  }, [])

  useEffect(() => { if (guildId) loadFiles(guildId) }, [guildId, loadFiles])

  const files = filesByGroup[target] || []
  const canUpload = files.length < MAX_FILES && !uploading

  async function upload(file) {
    if (!file) return
    setError(null); setUploading(true)
    const form = new FormData()
    form.append('file', file)
    form.append('guild_id', guildId)
    form.append('group', target)
    const res = await fetch('/api/discord/guild-watermarks', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'อัปโหลดไม่สำเร็จ')
    else await loadFiles(guildId)
    setUploading(false)
  }

  async function remove(filename) {
    if (!confirm(`ลบ "${filename}"?`)) return
    setDeleting(filename)
    const qs = new URLSearchParams({ guild_id: guildId, group: target, file: filename })
    await fetch(`/api/discord/guild-watermarks?${qs}`, { method: 'DELETE' })
    setFilesByGroup(prev => ({ ...prev, [target]: (prev[target] || []).filter(f => f !== filename) }))
    setDeleting(null)
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }

  function imgUrl(filename) {
    const qs = new URLSearchParams({ guild_id: guildId, group: target, file: filename, raw: '1' })
    return `/api/discord/guild-watermarks?${qs}`
  }

  if (status === 'loading') {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (guilds.length === 0 && !loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text mb-2">ลายน้ำ Guild</h1>
        <p className="text-sm text-warm-500 dark:text-disc-muted">
          ต้องเป็น Admin ของ guild ถึงจะจัดการลายน้ำระดับ guild ได้
        </p>
      </div>
    )
  }

  const targetTabs = [{ key: ROOT, label: 'ลายน้ำกลาง (Guild)' }, ...groups.map(g => ({ key: g, label: g }))]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">ลายน้ำ Guild</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">
          จัดการลายน้ำของ guild — "ลายน้ำกลาง" ใช้กับ Quote + Basket (ไม่มีกลุ่ม), ลายน้ำกลุ่มใช้กับ Basket ที่โพสต์ในนามกลุ่มนั้น
        </p>
      </div>

      {/* เลือก guild — dropdown ถ้าหลายอัน, label ถ้าอันเดียว (ให้รู้เสมอว่ากำลังดู server ไหน) */}
      <div className="mb-4">
        <label className="text-sm font-medium text-warm-700 dark:text-disc-muted mb-1 block">Server</label>
        {guilds.length > 1 ? (
          <select
            value={guildId}
            onChange={e => setGuildId(e.target.value)}
            className="h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal w-full"
          >
            {guilds.map(g => <option key={g.guild_id} value={g.guild_id}>{g.name}</option>)}
          </select>
        ) : (
          <div className="h-11 px-3 flex items-center rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text">
            {guilds.find(g => g.guild_id === guildId)?.name || guildId}
          </div>
        )}
      </div>

      {/* tab เลือกโฟลเดอร์เป้าหมาย */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {targetTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTarget(t.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-base whitespace-nowrap transition ${
              target === t.key
                ? 'bg-teal/10 text-teal font-medium'
                : 'text-warm-600 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
            }`}
          >
            {t.key === ROOT ? <Server size={16} /> : <span>📦</span>}
            {t.label}
            <span className="text-xs opacity-60">({(filesByGroup[t.key] || []).length})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
      ) : (
        <>
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
              <p className="text-sm text-gray-500 dark:text-disc-muted">ครบ {MAX_FILES} ไฟล์แล้ว ลบไฟล์เก่าก่อน</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700 dark:text-disc-text">
                  วางรูปที่นี่ หรือคลิกเพื่ออัปโหลดเข้า "{targetTabs.find(t => t.key === target)?.label}"
                </p>
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

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 dark:text-disc-muted">{files.length} / {MAX_FILES} ไฟล์</span>
          </div>

          {/* Grid */}
          {files.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-disc-muted text-center py-8">ยังไม่มีลายน้ำในโฟลเดอร์นี้</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {files.map(filename => (
                <div key={filename} className="group relative bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border overflow-hidden">
                  <div className="aspect-square bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#2a2d31_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex items-center justify-center p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imgUrl(filename)}
                      alt={stripExt(filename)}
                      className="max-h-24 max-w-full object-contain"
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                    />
                    <div className="hidden items-center justify-center">
                      <ImageIcon size={32} className="text-gray-300 dark:text-disc-muted" />
                    </div>
                  </div>
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
            </div>
          )}
        </>
      )}
    </div>
  )
}
