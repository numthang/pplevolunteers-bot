'use client'
import { useState } from 'react'

export default function OrgGeneral({ org, myRole }) {
  const isOwner = myRole === 'owner'
  const [name, setName] = useState(org.name)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function saveName(e) {
    e.preventDefault(); setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setNote(d.error || 'บันทึกไม่สำเร็จ')
    setNote('บันทึกชื่อแล้ว'); window.location.reload()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">ชื่อองค์กร</p>
        {isOwner ? (
          <form onSubmit={saveName} className="mt-2 flex gap-2">
            <input value={name} onChange={e => setName(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />
            <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">บันทึก</button>
          </form>
        ) : (
          <p className="mt-1 text-gray-900 dark:text-disc-text">{org.name}</p>
        )}
      </section>

      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}
