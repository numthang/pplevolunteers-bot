'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Trash2, Plus, Check, X, ArrowLeft, ChevronUp, ChevronDown } from 'lucide-react'

const EMPTY_FORM = { discordId: '', displayName: '', position: '', sortOrder: 0 }

function MemberSearch({ onSelect }) {
  const t = useTranslations('docs')
  const [q, setQ]             = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const debounce = useRef(null)
  const wrapRef  = useRef(null)

  useEffect(() => { document.title = t('settings.clientTitle') }, [t])

  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    clearTimeout(debounce.current)
    if (!q.trim()) { setResults([]); setOpen(false); return }
    debounce.current = setTimeout(async () => {
      const res  = await fetch(`/api/docs/members?q=${encodeURIComponent(q)}&limit=10`)
      const data = await res.json()
      setResults(data.data || [])
      setOpen(true)
    }, 280)
  }, [q])

  function select(m) {
    onSelect(m)
    setQ('')
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        placeholder={t('settings.memberSearchPlaceholder')}
        value={q}
        onChange={e => setQ(e.target.value)}
        className="w-full text-base px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.map(m => {
            const name = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.discord_id
            return (
              <li key={m.discord_id}>
                <button
                  type="button"
                  onClick={() => select(m)}
                  className="w-full text-left px-4 py-2.5 hover:bg-warm-50 dark:hover:bg-disc-hover transition text-warm-900 dark:text-disc-text"
                >
                  <span className="text-base font-medium">{name}</span>
                  {m.member_id && <span className="ml-2 text-sm text-warm-400 dark:text-disc-muted">#{m.member_id}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ScopeBadges({ nodes = [] }) {
  const t = useTranslations('docs')
  if (!nodes.length) {
    return (
      <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded bg-warm-100 dark:bg-disc-hover text-warm-400 dark:text-disc-muted">
        {t('settings.noScope')}
      </span>
    )
  }
  const labels = nodes.map(n => {
    const i = n.indexOf(':')
    if (i === -1) return null
    const type = n.slice(0, i)
    const val  = n.slice(i + 1)
    if (type === 'province')  return { label: val, wide: false }
    if (type === 'subregion') return { label: val.replace(/^ทีม/, ''), wide: true }
    if (type === 'region')    return { label: val.replace(/^ทีม/, ''), wide: true }
    return null
  }).filter(Boolean)
  if (!labels.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {labels.map((l, i) => (
        <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${l.wide
          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
          : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
        }`}>
          {l.label}
        </span>
      ))}
    </div>
  )
}

export default function DocsSettingsPage() {
  const t = useTranslations('docs')
  const { status } = useSession()
  const router = useRouter()

  const [payers, setPayers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [adding, setAdding]       = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [selectedMember, setSelectedMember] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [editForm, setEditForm]   = useState({})

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    load()
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [status])

  function load() {
    setLoading(true)
    fetch('/api/docs/payers')
      .then(r => r.json())
      .then(d => { if (d.data) setPayers(d.data); else setError(d.error || t('settings.loadFailed')) })
      .catch(() => setError(t('settings.loadFailed')))
      .finally(() => setLoading(false))
  }

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('/api/docs/payers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || t('settings.addFailed')); return }
      setPayers(prev => [...prev, d.data].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id))
      setForm(EMPTY_FORM)
      setSelectedMember(null)
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit(id) {
    setSaving(true)
    try {
      const r = await fetch(`/api/docs/payers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || t('settings.editFailed')); return }
      setPayers(prev =>
        prev.map(p => p.id === id ? { ...p, ...d.data } : p)
            .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      )
      setEditId(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id, displayName) {
    if (!confirm(t('settings.deleteConfirm', { name: displayName }))) return
    const r = await fetch(`/api/docs/payers/${id}`, { method: 'DELETE' })
    if (r.ok) setPayers(prev => prev.filter(p => p.id !== id))
    else setError(t('settings.deleteFailed'))
  }

  async function handleMove(id, direction) {
    const idx = payers.findIndex(p => p.id === id)
    const other = payers[idx + direction]
    if (!other) return

    const newOrder = payers[idx].sort_order
    const otherOrder = other.sort_order
    const swapOrder = newOrder === otherOrder ? newOrder + direction : otherOrder

    await Promise.all([
      fetch(`/api/docs/payers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: swapOrder }),
      }),
      fetch(`/api/docs/payers/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: newOrder }),
      }),
    ])
    load()
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-warm-400 dark:text-disc-muted text-base">
        {t('settings.loading')}
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/docs" className="text-warm-400 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{t('settings.heading')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('settings.description')}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-warm-200 dark:border-disc-border flex items-center justify-between">
          <span className="text-base font-semibold text-warm-700 dark:text-disc-text">
            {t('settings.payersCount', { count: payers.length })}
          </span>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-orange hover:text-orange-light transition-colors"
            >
              <Plus size={15} /> {t('settings.addPayerButton')}
            </button>
          )}
        </div>

        {payers.length === 0 && !adding && (
          <div className="px-4 py-10 text-center text-base text-warm-400 dark:text-disc-muted">
            {t('settings.emptyState')}
          </div>
        )}

        <ul className="divide-y divide-warm-100 dark:divide-disc-border">
          {payers.map((p, idx) => (
            <li key={p.id} className="px-4 py-3">
              {editId === p.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm text-warm-500 dark:text-disc-muted mb-1">{t('settings.displayNameLabel')}</label>
                      <input
                        value={editForm.displayName}
                        onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                        className="w-full text-base px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-warm-500 dark:text-disc-muted mb-1">{t('settings.positionLabel')}</label>
                      <input
                        value={editForm.position}
                        onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}
                        className="w-full text-base px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-warm-500 dark:text-disc-muted">{t('settings.sortOrderLabel')}</label>
                    <input
                      type="number"
                      value={editForm.sortOrder}
                      onChange={e => setEditForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                      className="w-20 text-base px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40"
                    />
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => handleSaveEdit(p.id)}
                        disabled={saving}
                        className="flex items-center gap-1 text-sm px-3 py-1.5 bg-orange text-white rounded-lg hover:bg-orange-light disabled:opacity-50 transition-colors"
                      >
                        <Check size={13} /> {t('settings.saveButton')}
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="flex items-center gap-1 text-sm px-3 py-1.5 border border-warm-200 dark:border-disc-border text-warm-600 dark:text-disc-muted rounded-lg hover:bg-warm-50 dark:hover:bg-disc-bg2 transition-colors"
                      >
                        <X size={13} /> {t('settings.cancelButton')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => handleMove(p.id, -1)}
                      disabled={idx === 0}
                      className="text-warm-300 dark:text-disc-muted hover:text-warm-600 dark:hover:text-disc-text disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      onClick={() => handleMove(p.id, 1)}
                      disabled={idx === payers.length - 1}
                      className="text-warm-300 dark:text-disc-muted hover:text-warm-600 dark:hover:text-disc-text disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  <span className="text-xs text-warm-300 dark:text-disc-muted w-4 text-center select-none tabular-nums">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-warm-900 dark:text-disc-text">{p.display_name}</p>
                    <p className="text-sm text-warm-500 dark:text-disc-muted">{p.position}</p>
                    <ScopeBadges nodes={p.scope_nodes} />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditId(p.id); setEditForm({ displayName: p.display_name, position: p.position, sortOrder: p.sort_order }) }}
                      className="p-1.5 text-warm-400 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text transition-colors"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.display_name)}
                      className="p-1.5 text-warm-400 dark:text-disc-muted hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {adding && (
          <form onSubmit={handleAdd} className="px-4 py-4 border-t border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-bg2 space-y-3">
            <p className="text-xs font-semibold text-warm-600 dark:text-disc-muted uppercase tracking-wide">{t('settings.addPayerButton')}</p>

            <div>
              <label className="block text-sm text-warm-500 dark:text-disc-muted mb-1">{t('settings.searchMemberLabel')}</label>
              {selectedMember ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-orange/40 bg-orange/5 text-base">
                  <span className="flex-1 text-warm-900 dark:text-disc-text font-medium">{selectedMember.display_name || selectedMember.discord_id}</span>
                  <button type="button" onClick={() => { setSelectedMember(null); setForm(f => ({ ...f, discordId: '', displayName: '' })) }}
                    className="text-warm-400 hover:text-red-500 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <MemberSearch onSelect={m => {
                  const name = m.display_name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.discord_id
                  setSelectedMember(m)
                  setForm(f => ({ ...f, discordId: m.discord_id, displayName: name }))
                }} />
              )}
            </div>

            {selectedMember && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-warm-500 dark:text-disc-muted mb-1">{t('settings.displayNameLabel')}</label>
                  <input
                    required
                    value={form.displayName}
                    onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                    className="w-full text-base px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40"
                  />
                </div>
                <div>
                  <label className="block text-sm text-warm-500 dark:text-disc-muted mb-1">{t('settings.positionLabel')}</label>
                  <input
                    required
                    placeholder={t('settings.positionPlaceholder')}
                    value={form.position}
                    onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                    className="w-full text-base px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange/40"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving || !selectedMember}
                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-light disabled:opacity-50 transition-colors"
              >
                <Plus size={15} /> {t('settings.addButton')}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setForm(EMPTY_FORM); setSelectedMember(null) }}
                className="text-sm px-4 py-2 border border-warm-200 dark:border-disc-border text-warm-600 dark:text-disc-muted rounded-lg hover:bg-warm-100 dark:hover:bg-disc-bg transition-colors"
              >
                {t('settings.cancelButton')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
