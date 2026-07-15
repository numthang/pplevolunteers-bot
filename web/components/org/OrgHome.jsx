'use client'
import { useState } from 'react'
import { orgSignOut } from '@/lib/orgSignIn.js'

export default function OrgHome({ user, orgs, activeOrg }) {
  const active = orgs.filter(o => o.status === 'active')
  const invited = orgs.filter(o => o.status === 'invited')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [note, setNote] = useState('')

  async function createOrg(e) {
    e.preventDefault()
    setBusy(true); setNote('')
    const r = await fetch('/api/org/orgs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    const data = await r.json()
    setBusy(false)
    if (!r.ok) { setNote(data.error || 'สร้างองค์กรไม่สำเร็จ'); return }
    await switchOrg(data.org.id, true)
  }

  async function switchOrg(orgId, reload = false) {
    await fetch('/api/org/orgs/switch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    })
    if (reload) window.location.reload()
    else window.location.reload()
  }

  async function invite(e) {
    e.preventDefault()
    setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${activeOrg.id}/invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    const data = await r.json()
    setBusy(false)
    if (!r.ok) { setNote(data.error || 'เชิญไม่สำเร็จ'); return }
    setInviteEmail(''); setNote(`เชิญ ${data.invited.email} แล้ว`)
  }

  return (
    <div className="max-w-2xl mx-auto mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">องค์กรของฉัน</h1>
          <p className="text-sm text-gray-500 dark:text-disc-muted">{user.name || user.email}</p>
        </div>
        <button onClick={() => orgSignOut()} className="text-sm text-gray-500 dark:text-disc-muted underline">
          ออกจากระบบ
        </button>
      </div>

      {activeOrg ? (
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
          <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-disc-muted">องค์กรที่กำลังใช้งาน</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-disc-text">{activeOrg.name}</h2>
          <p className="text-sm text-gray-500 dark:text-disc-muted">บทบาท: {activeOrg.role}</p>

          {activeOrg.role === 'owner' && (
            <form onSubmit={invite} className="mt-4 flex gap-2">
              <input
                type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                placeholder="เชิญด้วยอีเมล"
                className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text"
              />
              <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">เชิญ</button>
            </form>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-disc-text">ยังไม่มีองค์กร</h2>
          <p className="text-sm text-gray-500 dark:text-disc-muted">สร้างองค์กรแรกของคุณเพื่อเริ่มต้น</p>
        </div>
      )}

      {active.length > 1 && (
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
          <p className="text-sm font-medium text-gray-700 dark:text-disc-text">สลับองค์กร</p>
          <div className="mt-2 space-y-1">
            {active.map(o => (
              <button
                key={o.id} onClick={() => switchOrg(o.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${o.id === activeOrg?.id ? 'bg-orange/10 text-orange' : 'text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-white/5'}`}
              >
                {o.name} <span className="text-xs text-gray-400 dark:text-disc-muted">· {o.role}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {invited.length > 0 && (
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
          <p className="text-sm font-medium text-gray-700 dark:text-disc-text">คำเชิญ</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">
            {invited.map(o => o.name).join(', ')} — คำเชิญจะถูกยืนยันอัตโนมัติเมื่อคุณเข้าสู่ระบบ
          </p>
        </div>
      )}

      <form onSubmit={createOrg} className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">สร้างองค์กรใหม่</p>
        <div className="mt-2 flex gap-2">
          <input
            required value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="ชื่อองค์กร"
            className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text"
          />
          <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">สร้าง</button>
        </div>
      </form>

      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}
