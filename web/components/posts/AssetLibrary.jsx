'use client'

// คลังภาพ — วัตถุดิบที่ตั้งใจเก็บ (post_assets) **คนละอย่างกับสื่อแนบโพสต์**
// สื่อแนบโพสต์โดน services/postsRetention.js ลบไฟล์ 30/180 วันหลังเผยแพร่ · คลังไม่มี retention
//
// 2 กอง: `personal` (ใครก็อัปเข้ากองตัวเองได้) · `org` (กองกลาง — ทีมสื่อเท่านั้นที่เลื่อนขึ้นได้)
// ไม่มี folder โดยตั้งใจ — ใช้ tags[] + smart view แทน (รูป 1 ใบอยู่ได้หลายเรื่อง)
//
// ใช้ 2 ที่: หน้า /posts/library (mode='page') · AssetPickerModal ตอนหยิบรูปไปใช้ (mode='pick')
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Upload, Loader2, X, Pencil, ArrowUpFromLine, ImageOff, Search, Check } from 'lucide-react'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const srcOf = a => `/api/posts/assets/${a.id}/file`

export default function AssetLibrary({ mode = 'page', onPick = null }) {
  const t = useTranslations('posts.library')
  const [pile, setPile] = useState('all')
  const [view, setView] = useState('recent')
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)

  const [items, setItems] = useState([])
  const [tags, setTags] = useState([])
  const [canPublish, setCanPublish] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [uploading, setUploading] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  const [metaOpen, setMetaOpen] = useState(false)
  const [form, setForm] = useState({ title: '', tags: '', consentNote: '', usableUntil: '', toOrg: false })
  const [editing, setEditing] = useState(null)   // asset ที่กำลังแก้ข้อมูล
  const [picking, setPicking] = useState(null)   // id ที่กำลังหยิบไปใช้ (กันกดรัว)

  const fileInputRef = useRef(null)

  async function load() {
    setLoading(true)
    setError('')
    const sp = new URLSearchParams({ pile, view })
    if (q.trim()) sp.set('q', q.trim())
    if (tag) sp.set('tag', tag)
    try {
      const res = await fetch(`/api/posts/assets?${sp}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('loadFailed')); return }
      setItems(data.data || [])
      setTags(data.tags || [])
      setCanPublish(!!data.canPublish)
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  // พิมพ์ค้นหา → หน่วงก่อนยิง (คลังโตแล้วยิงทุกตัวอักษร = เปลืองเปล่า)
  useEffect(() => {
    const timer = setTimeout(load, q ? 350 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pile, view, tag, q])

  async function uploadFiles(files) {
    if (!files.length) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    files.forEach(f => fd.append('files', f))
    if (form.title) fd.append('title', form.title)
    if (form.tags) fd.append('tags', form.tags)
    if (form.consentNote) fd.append('consentNote', form.consentNote)
    if (form.usableUntil) fd.append('usableUntil', form.usableUntil)
    if (form.toOrg && canPublish) fd.append('visibility', 'org')
    try {
      const res = await fetch('/api/posts/assets', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('uploadFailed')); return }
      setForm({ title: '', tags: '', consentNote: '', usableUntil: '', toOrg: false })
      await load()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  async function saveMeta(asset, patch) {
    const res = await fetch(`/api/posts/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || t('saveFailed')); return false }
    setItems(prev => prev.map(a => (a.id === asset.id ? { ...a, ...data.data } : a)))
    return true
  }

  async function remove(asset) {
    if (!confirm(t('confirmDelete'))) return
    const res = await fetch(`/api/posts/assets/${asset.id}`, { method: 'DELETE' })
    if (!res.ok) { setError(t('deleteFailed')); return }
    setItems(prev => prev.filter(a => a.id !== asset.id))
  }

  async function pick(asset) {
    if (!onPick || picking) return
    setPicking(asset.id)
    try {
      await onPick(asset)
    } finally {
      setPicking(null)
    }
  }

  const PILES = [['all', t('pileAll')], ['personal', t('pileMine')], ['org', t('pileOrg')]]

  return (
    <div className="flex flex-col gap-4">
      {/* แถบกรอง — กอง / ค้นหา / smart view */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
          {PILES.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPile(key)}
              className={`px-3 py-1.5 text-sm transition ${
                pile === key
                  ? 'bg-orange text-white'
                  : 'text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text"
          />
        </div>

        <button
          onClick={() => setView(v => (v === 'unused' ? 'recent' : 'unused'))}
          className={`px-3 py-1.5 text-sm rounded-lg border transition ${
            view === 'unused'
              ? 'border-orange text-orange'
              : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
          }`}
        >
          {t('viewUnused')}
        </button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tag && (
            <button
              onClick={() => setTag(null)}
              className="px-2 py-1 text-xs rounded-full bg-orange text-white inline-flex items-center gap-1"
            >
              {tag} <X size={11} />
            </button>
          )}
          {tags.filter(x => x.tag !== tag).map(x => (
            <button
              key={x.tag}
              onClick={() => setTag(x.tag)}
              className="px-2 py-1 text-xs rounded-full border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
            >
              {x.tag} <span className="text-warm-400 dark:text-disc-muted">{x.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* กล่องอัปโหลด — ไม่มี autosave จึงต้องกดปุ่มเอง (กฎ Create ใน CLAUDE.md) */}
      <div
        tabIndex={0}
        onPaste={e => {
          const files = Array.from(e.clipboardData?.files || [])
          if (files.length) { e.preventDefault(); uploadFiles(files) }
        }}
        onDrop={e => {
          e.preventDefault(); setDropHover(false)
          const files = Array.from(e.dataTransfer?.files || [])
          if (files.length) uploadFiles(files)
        }}
        onDragOver={e => e.preventDefault()}
        onDragEnter={() => setDropHover(true)}
        onDragLeave={() => setDropHover(false)}
        className={`rounded-lg border border-dashed p-4 text-center transition-colors ${
          dropHover ? 'border-orange bg-warm-50 dark:bg-disc-hover' : 'border-warm-200 dark:border-disc-border'
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
          {t('uploadButton')}
        </button>
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-1.5">{t('uploadHint')}</p>

        <button
          onClick={() => setMetaOpen(o => !o)}
          className="mt-2 text-xs text-warm-500 dark:text-disc-muted underline hover:text-warm-900 dark:hover:text-disc-text"
        >
          {metaOpen ? t('metaHide') : t('metaShow')}
        </button>

        {metaOpen && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 text-left">
            <label className="text-sm text-warm-700 dark:text-disc-text">
              {t('fieldTitle')}
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text"
              />
            </label>
            <label className="text-sm text-warm-700 dark:text-disc-text">
              {t('fieldTags')}
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder={t('fieldTagsPlaceholder')}
                className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text"
              />
            </label>
            {/* สิทธิ์การใช้ภาพ — ถามตอนอัปเท่านั้น เพราะเติมย้อนหลังต้องไล่ถามทุกรูปซึ่งทำไม่ได้จริง */}
            <label className="text-sm text-warm-700 dark:text-disc-text">
              {t('fieldConsent')}
              <input
                value={form.consentNote}
                onChange={e => setForm(f => ({ ...f, consentNote: e.target.value }))}
                placeholder={t('fieldConsentPlaceholder')}
                className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text"
              />
            </label>
            <label className="text-sm text-warm-700 dark:text-disc-text">
              {t('fieldUsableUntil')}
              <input
                type="date"
                value={form.usableUntil}
                onChange={e => setForm(f => ({ ...f, usableUntil: e.target.value }))}
                className="mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text"
              />
            </label>
            {canPublish && (
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-warm-700 dark:text-disc-text">
                <input
                  type="checkbox"
                  checked={form.toOrg}
                  onChange={e => setForm(f => ({ ...f, toOrg: e.target.checked }))}
                />
                {t('fieldToOrg')}
              </label>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <p className="text-sm text-warm-500 dark:text-disc-muted">{t('loading')}</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 text-warm-400 dark:text-disc-muted py-6">
          <ImageOff size={18} />
          <span className="text-sm">{t('empty')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {items.map(a => (
            <div
              key={a.id}
              className="relative group aspect-[4/3] rounded-lg overflow-hidden border border-warm-200 dark:border-disc-border bg-black"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${srcOf(a)}?thumb=1`}
                alt={a.title || ''}
                loading="lazy"
                decoding="async"
                onClick={() => (mode === 'pick' ? pick(a) : null)}
                className={`w-full h-full object-cover ${mode === 'pick' ? 'cursor-pointer' : ''}`}
              />

              {mode === 'pick' && (
                <button
                  onClick={() => pick(a)}
                  disabled={picking === a.id}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition"
                >
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm">
                    {picking === a.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {t('useThis')}
                  </span>
                </button>
              )}

              <div className="absolute top-1.5 left-1.5 flex gap-1">
                {a.visibility === 'org' && (
                  <span className="px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px]">{t('badgeOrg')}</span>
                )}
                {a.used_count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px]">
                    {t('badgeUsed', { n: a.used_count })}
                  </span>
                )}
              </div>

              {/* ปุ่มจัดการ — **โชว์ตลอด ไม่ซ่อนรอ hover** (จอสัมผัสไม่มี hover = กดลบไม่ได้เลย)
                  โชว์ในโหมด pick ด้วย: กล่องเลือกรูปคือทางที่คนเข้าคลังบ่อยที่สุด
                  เผลอกดลบไม่ได้ง่ายๆ เพราะมี confirm() คั่นอยู่แล้ว */}
              <div className="absolute top-1.5 right-1.5 z-10 flex gap-1">
                {canPublish && a.visibility === 'personal' && (
                  <button
                    onClick={() => saveMeta(a, { visibility: 'org' })}
                    title={t('promoteTitle')}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  >
                    <ArrowUpFromLine size={12} />
                  </button>
                )}
                <button
                  onClick={() => setEditing(a)}
                  title={t('editTitle')}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => remove(a)}
                  title={t('deleteTitle')}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-500 transition"
                >
                  <X size={13} />
                </button>
              </div>

              {a.title && (
                <span className="absolute bottom-0 inset-x-0 px-2 py-1 bg-black/60 text-white text-xs truncate">
                  {a.title}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AssetEditModal
          asset={editing}
          onClose={() => setEditing(null)}
          onSave={async patch => {
            const ok = await saveMeta(editing, patch)
            if (ok) setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/** แก้ข้อมูลรูป — ไม่มี autosave จึงมีปุ่มบันทึก · ปิดได้ 3 ทาง: X · ESC · คลิกนอกกล่อง */
function AssetEditModal({ asset, onClose, onSave }) {
  const t = useTranslations('posts.library')
  const [form, setForm] = useState({
    title: asset.title || '',
    tags: (asset.tags || []).join(', '),
    consentNote: asset.consent_note || '',
    usableUntil: asset.usable_until ? String(asset.usable_until).slice(0, 10) : '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const field = 'mt-1 w-full px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-xl bg-card-bg border border-warm-200 dark:border-disc-border p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-warm-900 dark:text-disc-text">{t('editTitle')}</h3>
          <button
            onClick={onClose}
            title={t('closeTitle')}
            className="w-7 h-7 flex items-center justify-center rounded-full text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            <X size={15} />
          </button>
        </div>

        <label className="text-sm text-warm-700 dark:text-disc-text">
          {t('fieldTitle')}
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={field} />
        </label>
        <label className="text-sm text-warm-700 dark:text-disc-text">
          {t('fieldTags')}
          <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} className={field} />
        </label>
        <label className="text-sm text-warm-700 dark:text-disc-text">
          {t('fieldConsent')}
          <input value={form.consentNote} onChange={e => setForm(f => ({ ...f, consentNote: e.target.value }))} className={field} />
        </label>
        <label className="text-sm text-warm-700 dark:text-disc-text">
          {t('fieldUsableUntil')}
          <input type="date" value={form.usableUntil} onChange={e => setForm(f => ({ ...f, usableUntil: e.target.value }))} className={field} />
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            {t('cancel')}
          </button>
          <button
            onClick={async () => {
              setSaving(true)
              await onSave({
                title: form.title,
                tags: form.tags,
                consentNote: form.consentNote,
                usableUntil: form.usableUntil,
              })
              setSaving(false)
            }}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 transition"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
