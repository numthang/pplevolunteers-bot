'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Cpu, Sparkles } from 'lucide-react'

const INPUT_CLS =
  'w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border ' +
  'bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal'

// model ที่แนะนำต่อค่าย — เป็นแค่ datalist suggestion พิมพ์เองได้
const MODEL_SUGGEST = {
  claude: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
}
const PROVIDER_LABEL = { claude: 'Claude (Anthropic)', gemini: 'Gemini (Google)' }

// ─── Agent: ค่าย + โมเดล + max_tokens (global) ────────────────────────────────
function AgentSection() {
  const [cfg, setCfg]       = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState(null)

  useEffect(() => {
    fetch('/api/discord/ai-config')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) setCfg(d); else setError(d.error || 'โหลดไม่สำเร็จ') })
      .catch(() => setError('โหลดไม่สำเร็จ'))
  }, [])

  async function save() {
    setSaving(true); setSaved(false); setError(null)
    const res = await fetch('/api/discord/ai-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: cfg.provider, model: cfg.model, maxTokens: cfg.maxTokens }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
    else { const d = await res.json().catch(() => ({})); setError(d.error || 'บันทึกไม่สำเร็จ') }
  }

  if (error && !cfg) return <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
  if (!cfg) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>

  const providers = cfg.providers || ['claude', 'gemini']

  return (
    <div className="rounded-2xl border border-warm-200 dark:border-disc-border bg-card-bg p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <Cpu size={18} className="text-orange" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-disc-text">โมเดล AI</h2>
      </div>
      <p className="text-xs text-gray-400 dark:text-disc-muted mb-4">
        ใช้กับทุกฟีเจอร์ AI (ตะกร้าสื่อ, สรุปเธรด) — API key อยู่ใน .env ของเซิร์ฟเวอร์
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-disc-muted mb-1">ค่าย</label>
          <select value={cfg.provider}
            onChange={e => {
              const provider = e.target.value
              const model = (MODEL_SUGGEST[provider] || [])[0] || ''
              setCfg(c => ({ ...c, provider, model }))
            }}
            className={INPUT_CLS}>
            {providers.map(p => <option key={p} value={p}>{PROVIDER_LABEL[p] || p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-disc-muted mb-1">โมเดล</label>
          <input list="model-suggest" value={cfg.model}
            onChange={e => setCfg(c => ({ ...c, model: e.target.value }))}
            className={INPUT_CLS} placeholder="ชื่อโมเดล" />
          <datalist id="model-suggest">
            {(MODEL_SUGGEST[cfg.provider] || []).map(m => <option key={m} value={m} />)}
          </datalist>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-disc-muted mb-1">max tokens</label>
          <input type="number" min={256} max={8192} step={256} value={cfg.maxTokens}
            onChange={e => setCfg(c => ({ ...c, maxTokens: Number(e.target.value) }))}
            className={INPUT_CLS} />
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} บันทึก
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">บันทึกแล้ว</span>}
        {error && <span className="text-sm text-red-500 dark:text-red-400">{error}</span>}
      </div>
    </div>
  )
}

// ─── Mode card: แก้ label/prompt/enabled รายตัว ──────────────────────────────
function ModeCard({ mode, first, last, onMove, onSaved, onDeleted }) {
  const [label, setLabel]     = useState(mode.label)
  const [prompt, setPrompt]   = useState(mode.prompt)
  const [enabled, setEnabled] = useState(mode.enabled)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  const dirty = label !== mode.label || prompt !== mode.prompt || enabled !== mode.enabled

  async function save() {
    setSaving(true); setSaved(false)
    const res = await fetch('/api/discord/ai-modes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mode.id, label, prompt, enabled }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); onSaved({ ...mode, label, prompt, enabled }) }
  }

  async function del() {
    if (!confirm(`ลบโหมด "${mode.label}" (${mode.value})?`)) return
    await fetch(`/api/discord/ai-modes?id=${mode.id}`, { method: 'DELETE' })
    onDeleted(mode.id)
  }

  return (
    <div className="rounded-2xl border border-warm-200 dark:border-disc-border bg-card-bg p-4">
      <div className="flex items-center gap-2 mb-3">
        <input value={label} onChange={e => setLabel(e.target.value)}
          className="flex-1 min-w-0 px-3 py-1.5 text-base font-medium rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal" />
        <span className="shrink-0 px-2 py-1 text-xs font-mono rounded bg-warm-100 dark:bg-disc-hover text-gray-500 dark:text-disc-muted">{mode.value}</span>
        <label className="shrink-0 flex items-center gap-1.5 text-xs text-gray-500 dark:text-disc-muted cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          เปิดใช้
        </label>
        <div className="shrink-0 flex flex-col">
          <button onClick={() => onMove(-1)} disabled={first} title="เลื่อนขึ้น"
            className="text-gray-400 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text disabled:opacity-25"><ChevronUp size={16} /></button>
          <button onClick={() => onMove(1)} disabled={last} title="เลื่อนลง"
            className="text-gray-400 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text disabled:opacity-25"><ChevronDown size={16} /></button>
        </div>
      </div>

      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={6}
        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal" />

      <div className="flex items-center gap-2 mt-3">
        <button onClick={save} disabled={saving || !dirty}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-30">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} บันทึก
        </button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">บันทึกแล้ว</span>}
        <button onClick={del} title="ลบโหมดนี้"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
          <Trash2 size={14} /> ลบ
        </button>
      </div>
    </div>
  )
}

// ─── Modes section: list + add ───────────────────────────────────────────────
function ModesSection() {
  const [modes, setModes]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm]     = useState({ value: '', label: '', prompt: '' })
  const [addErr, setAddErr] = useState(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/discord/ai-modes')
    if (res.ok) { const d = await res.json(); setModes(d.modes || []) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= modes.length) return
    const next = [...modes]
    ;[next[i], next[j]] = [next[j], next[i]]
    setModes(next)
    await fetch('/api/discord/ai-modes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', order: next.map(m => m.id) }),
    })
  }

  async function add() {
    setAddErr(null)
    const res = await fetch('/api/discord/ai-modes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setAddErr(d.error || 'เพิ่มไม่สำเร็จ'); return }
    setModes(prev => [...prev, d.mode])
    setForm({ value: '', label: '', prompt: '' })
    setAdding(false)
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} className="text-orange" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-disc-text">โหมด / Prompt</h2>
      </div>
      <p className="text-xs text-gray-400 dark:text-disc-muted mb-4">
        ตัวเลือกที่โผล่ในเมนู &quot;🤖 AI ปรับ Caption&quot; — แก้แล้วมีผลทันที (bot อ่านจาก DB)
      </p>

      <div className="flex flex-col gap-3">
        {modes.map((m, i) => (
          <ModeCard key={m.id} mode={m} first={i === 0} last={i === modes.length - 1}
            onMove={dir => move(i, dir)}
            onSaved={u => setModes(prev => prev.map(x => x.id === u.id ? u : x))}
            onDeleted={id => setModes(prev => prev.filter(x => x.id !== id))} />
        ))}
      </div>

      {adding ? (
        <div className="mt-3 rounded-2xl border border-dashed border-warm-300 dark:border-disc-border bg-card-bg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              placeholder="key (a-z 0-9 _ เช่น summary)" className={INPUT_CLS} />
            <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="ชื่อที่แสดง (เช่น 📋 สรุปประเด็น)" className={INPUT_CLS} />
          </div>
          <textarea value={form.prompt} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
            rows={5} placeholder="prompt..." className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal" />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={add}
              className="px-3 py-1.5 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition">เพิ่ม</button>
            <button onClick={() => { setAdding(false); setAddErr(null) }}
              className="px-3 py-1.5 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition">ยกเลิก</button>
            {addErr && <span className="text-sm text-red-500 dark:text-red-400">{addErr}</span>}
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-dashed border-warm-300 dark:border-disc-border text-gray-600 dark:text-disc-muted hover:border-orange hover:text-orange transition">
          <Plus size={16} /> เพิ่มโหมดใหม่
        </button>
      )}
    </div>
  )
}

export default function AiConfigPage() {
  const { status } = useSession()
  const router = useRouter()
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') {
      fetch('/api/discord/ai-config').then(r => { if (r.status === 403) setForbidden(true) })
    }
  }, [status, router])

  if (status !== 'authenticated') {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (forbidden) {
    return <p className="text-sm text-warm-500 dark:text-disc-muted">ต้องเป็น Superadmin ถึงจะตั้งค่า AI ได้</p>
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">AI</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">ตั้งค่าโมเดลและ prompt ที่ระบบ AI ใช้</p>
      </div>
      <div className="flex flex-col gap-6">
        <AgentSection />
        <ModesSection />
      </div>
    </div>
  )
}
