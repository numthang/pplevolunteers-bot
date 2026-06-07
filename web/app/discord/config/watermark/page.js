'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Trash2, Upload, ImageIcon, X, Server, User, Star } from 'lucide-react'

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+-/, '')
}

// ─── Panel: ลายน้ำส่วนตัว (ทุก user) ──────────────────────────────────────────
const PERSONAL_MAX = 10

function PersonalPanel() {
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

  useEffect(() => { load() }, [load])

  async function upload(file) {
    if (!file) return
    setError(null); setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/watermark/personal', { method: 'POST', body: form })
    const data = await res.json()
    if (!res.ok) setError(data.error || 'อัปโหลดไม่สำเร็จ')
    else await load()
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
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) upload(file)
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>

  const canUpload = files.length < PERSONAL_MAX && !uploading

  return (
    <>
      <p className="text-sm text-gray-500 dark:text-disc-muted mb-4">
        รูปลายน้ำส่วนตัว ใช้ได้กับทุก guild — แสดงขึ้นก่อนลายน้ำของ guild เมื่อใช้คำสั่ง bot
      </p>

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
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={e => upload(e.target.files?.[0])} disabled={!canUpload} />
        <Upload size={28} className="mx-auto mb-3 text-gray-400 dark:text-disc-muted" />
        {uploading ? (
          <p className="text-sm text-orange font-medium">กำลังอัปโหลด...</p>
        ) : files.length >= PERSONAL_MAX ? (
          <p className="text-sm text-gray-500 dark:text-disc-muted">ครบ {PERSONAL_MAX} ไฟล์แล้ว ลบไฟล์เก่าก่อนอัปโหลดใหม่</p>
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

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 dark:text-disc-muted">{files.length} / {PERSONAL_MAX} ไฟล์</span>
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-disc-muted text-center py-8">ยังไม่มีลายน้ำ</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {files.map(filename => (
            <div key={filename} className="group relative bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border overflow-hidden">
              <div className="aspect-square bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#2a2d31_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex items-center justify-center p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/watermark/personal/${encodeURIComponent(filename)}`} alt={stripExt(filename)}
                  className="max-h-24 max-w-full object-contain"
                  onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                <div className="hidden items-center justify-center"><ImageIcon size={32} className="text-gray-300 dark:text-disc-muted" /></div>
              </div>
              <div className="px-3 py-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-gray-700 dark:text-disc-text truncate" title={filename}>{stripExt(filename)}</p>
                <button onClick={() => remove(filename)} disabled={deleting === filename}
                  className="shrink-0 p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {canUpload && (
            <button onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-warm-300 dark:border-disc-border hover:border-orange dark:hover:border-orange text-gray-400 dark:text-disc-muted hover:text-orange transition flex flex-col items-center justify-center gap-2">
              <Upload size={24} />
              <span className="text-xs">อัปโหลด</span>
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ─── Panel: ลายน้ำ Guild (admin) ──────────────────────────────────────────────
const GUILD_MAX = 15
const ROOT = '' // โฟลเดอร์ลายน้ำกลางของ guild

function GuildPanel() {
  const fileRef = useRef(null)
  const [guilds,  setGuilds]  = useState([])
  const [guildId, setGuildId] = useState('')
  const [groups,  setGroups]  = useState([])
  const [filesByGroup, setFilesByGroup] = useState({})
  const [defaults, setDefaults] = useState({})
  const [target,  setTarget]  = useState(ROOT)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [settingDefault, setSettingDefault] = useState(false)
  const [error,    setError]    = useState(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    fetch('/api/discord/guild-watermarks')
      .then(r => r.json())
      .then(d => {
        const gs = d.guilds || []
        setGuilds(gs)
        if (gs.length) setGuildId(gs[0].guild_id)
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const loadFiles = useCallback(async (gid) => {
    if (!gid) return
    setLoading(true)
    const res = await fetch(`/api/discord/guild-watermarks?guild_id=${gid}`)
    if (res.ok) {
      const d = await res.json()
      setGroups(d.groups || [])
      setFilesByGroup(d.files || {})
      setDefaults(d.defaults || {})
    }
    setTarget(ROOT)
    setLoading(false)
  }, [])

  async function setGroupDefault(group, filename) {
    const next = filename ? `guild:${filename}` : 'none'
    setSettingDefault(true)
    await fetch('/api/discord/guild-watermarks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild_id: guildId, group, default_watermark: next }),
    })
    setDefaults(prev => ({ ...prev, [group]: next === 'none' ? null : next }))
    setSettingDefault(false)
  }

  useEffect(() => { if (guildId) loadFiles(guildId) }, [guildId, loadFiles])

  const files = filesByGroup[target] || []
  const canUpload = files.length < GUILD_MAX && !uploading

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

  if (guilds.length === 0 && !loading) {
    return <p className="text-sm text-warm-500 dark:text-disc-muted">ต้องเป็น Admin ของ guild ถึงจะจัดการลายน้ำระดับ guild ได้</p>
  }

  const targetTabs = [{ key: ROOT, label: 'ลายน้ำกลาง (Guild)' }, ...groups.map(g => ({ key: g, label: g }))]

  return (
    <>
      <p className="text-sm text-gray-500 dark:text-disc-muted mb-4">
        จัดการลายน้ำของ guild — &quot;ลายน้ำกลาง&quot; ใช้กับ Quote + Basket (ไม่มีกลุ่ม), ลายน้ำกลุ่มใช้กับ Basket ที่โพสต์ในนามกลุ่มนั้น
      </p>

      <div className="mb-4">
        <label className="text-sm font-medium text-warm-700 dark:text-disc-muted mb-1 block">Server</label>
        {guilds.length > 1 ? (
          <select value={guildId} onChange={e => setGuildId(e.target.value)}
            className="h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal w-full">
            {guilds.map(g => <option key={g.guild_id} value={g.guild_id}>{g.name}</option>)}
          </select>
        ) : (
          <div className="h-11 px-3 flex items-center rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text">
            {guilds.find(g => g.guild_id === guildId)?.name || guildId}
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {targetTabs.map(t => (
          <button key={t.key} onClick={() => setTarget(t.key)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-base whitespace-nowrap transition ${
              target === t.key ? 'bg-teal/10 text-teal font-medium' : 'text-warm-600 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
            }`}>
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
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => canUpload && fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-colors ${
              canUpload ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            } ${
              dragging ? 'border-orange bg-orange/5 dark:bg-orange/10' : 'border-warm-300 dark:border-disc-border hover:border-orange dark:hover:border-orange bg-white dark:bg-disc-hover'
            }`}
          >
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={e => upload(e.target.files?.[0])} disabled={!canUpload} />
            <Upload size={28} className="mx-auto mb-3 text-gray-400 dark:text-disc-muted" />
            {uploading ? (
              <p className="text-sm text-orange font-medium">กำลังอัปโหลด...</p>
            ) : files.length >= GUILD_MAX ? (
              <p className="text-sm text-gray-500 dark:text-disc-muted">ครบ {GUILD_MAX} ไฟล์แล้ว ลบไฟล์เก่าก่อน</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700 dark:text-disc-text">
                  วางรูปที่นี่ หรือคลิกเพื่ออัปโหลดเข้า &quot;{targetTabs.find(t => t.key === target)?.label}&quot;
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
            <span className="text-xs text-gray-400 dark:text-disc-muted">{files.length} / {GUILD_MAX} ไฟล์</span>
          </div>

          {files.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-disc-muted text-center py-8">ยังไม่มีลายน้ำในโฟลเดอร์นี้</p>
          ) : (
            <>
              {target !== ROOT && defaults[target] && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  ⭐ default: <span className="font-medium">{stripExt(defaults[target].replace('guild:', ''))}</span>
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {files.map(filename => {
                  const isDefault = target !== ROOT && defaults[target] === `guild:${filename}`
                  return (
                    <div key={filename} className={`group relative bg-card-bg rounded-xl border overflow-hidden transition ${isDefault ? 'border-amber-400 dark:border-amber-500' : 'border-warm-200 dark:border-disc-border'}`}>
                      <div className="aspect-square bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] dark:bg-[repeating-conic-gradient(#2a2d31_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] flex items-center justify-center p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imgUrl(filename)} alt={stripExt(filename)} className="max-h-24 max-w-full object-contain"
                          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
                        <div className="hidden items-center justify-center"><ImageIcon size={32} className="text-gray-300 dark:text-disc-muted" /></div>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-disc-text truncate" title={filename}>{stripExt(filename)}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          {target !== ROOT && (
                            <button
                              onClick={() => setGroupDefault(target, isDefault ? null : filename)}
                              disabled={settingDefault}
                              title={isDefault ? 'ยกเลิก default' : 'ตั้งเป็น default'}
                              className={`p-1 rounded transition disabled:opacity-40 ${isDefault ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-disc-muted hover:text-amber-400'}`}>
                              <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                            </button>
                          )}
                          <button onClick={() => remove(filename)} disabled={deleting === filename}
                            className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

// ─── Page: รวม personal + guild เป็นหน้าเดียว มี tab ───────────────────────────
export default function WatermarkPage() {
  const { status } = useSession()
  const router = useRouter()
  const [tab, setTab] = useState('personal')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status !== 'authenticated') {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  const tabs = [
    { key: 'personal', label: 'ส่วนตัว', icon: User },
    { key: 'guild',    label: 'Guild',   icon: Server },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text mb-4">ลายน้ำ</h1>

      <div className="flex gap-2 mb-5 border-b border-warm-200 dark:border-disc-border">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 -mb-px border-b-2 text-base transition ${
                tab === t.key
                  ? 'border-orange text-orange font-medium'
                  : 'border-transparent text-warm-600 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'personal' ? <PersonalPanel /> : <GuildPanel />}
    </div>
  )
}
