'use client'
import { useState } from 'react'

export default function NewOrgForm() {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function create(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const r = await fetch('/api/org/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await r.json()
    if (!r.ok) { setErr(data.error || 'สร้างองค์กรไม่สำเร็จ'); setBusy(false); return }
    // สลับไป org ที่เพิ่งสร้างแล้วเข้าหน้าหลัก
    await fetch('/api/org/orgs/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: data.org.id }),
    })
    window.location.href = '/org'
  }

  return (
    <div className="max-w-md mx-auto mt-6 rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6">
      <h1 className="text-lg font-bold text-gray-900 dark:text-disc-text">สร้างองค์กรใหม่</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">คุณจะเป็นเจ้าของ (owner) ขององค์กรนี้</p>
      <form onSubmit={create} className="mt-4 space-y-3">
        <input
          required autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder="ชื่อองค์กร"
          className="w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text"
        />
        <div className="flex gap-2">
          <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'กำลังสร้าง…' : 'สร้าง'}
          </button>
          <a href="/org" className="rounded-lg px-4 py-2 text-sm text-gray-500 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-white/5">ยกเลิก</a>
        </div>
      </form>
      {err && <p className="mt-3 text-sm text-red-accent">{err}</p>}
    </div>
  )
}
