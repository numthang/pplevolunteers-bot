'use client'
import { useState, useEffect, useRef } from 'react'

// preview slug ฝั่ง client (server เป็น source of truth จริงตอน createOrg)
function slugPreview(name) {
  return String(name || '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

// modal สร้างองค์กร — เรียกจาก switcher / empty-state · ปิดได้ X + ESC + click-outside
export default function CreateOrgModal({ open, onClose }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setName(''); setErr(''); setBusy(false)
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t) }
  }, [open, onClose])

  if (!open) return null

  async function create(e) {
    e.preventDefault()
    if (name.trim().length < 2) return
    setBusy(true); setErr('')
    const r = await fetch('/api/org/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(data.error || 'สร้างองค์กรไม่สำเร็จ'); setBusy(false); return }
    // org ใหม่ = active แล้วเข้าหน้า org (switcher จะโชว์ทันที)
    await fetch('/api/org/orgs/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: data.org.id }),
    })
    window.location.href = '/org'
  }

  const slug = slugPreview(name)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6 shadow-xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-disc-text">สร้างองค์กร</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">คุณจะเป็นเจ้าของ (owner) ขององค์กรนี้</p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="text-xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-disc-text">✕</button>
        </div>

        <form onSubmit={create} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-disc-text">ชื่อองค์กร</label>
            <input
              ref={inputRef} required value={name} onChange={e => setName(e.target.value)}
              placeholder="เช่น อาสาสมัครราชบุรี"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text"
            />
            {slug && (
              <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">
                รหัสองค์กร: <span className="text-gray-600 dark:text-disc-text">{slug}</span> (แก้ได้ภายหลังในตั้งค่า)
              </p>
            )}
          </div>
          {err && <p className="text-sm text-red-accent">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-white/5">ยกเลิก</button>
            <button disabled={busy || name.trim().length < 2} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
              {busy ? 'กำลังสร้าง…' : 'สร้างองค์กร'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
