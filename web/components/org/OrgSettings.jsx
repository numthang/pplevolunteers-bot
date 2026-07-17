'use client'
import { useState, useEffect, useRef } from 'react'

export default function OrgSettings({ org, members: initial, me, myRole }) {
  const isOwner = myRole === 'owner'
  const [members, setMembers] = useState(initial)
  const [name, setName] = useState(org.name)
  const [inviteEmail, setInviteEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // ── ค้นหาสมาชิก (governance page ไม่ dump ทั้ง org) ──
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = ยังไม่ค้น
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    const my = ++seq.current
    const t = setTimeout(async () => {
      const r = await fetch(`/api/org/orgs/${org.id}/members?q=${encodeURIComponent(q)}`)
      if (my !== seq.current) return // ทิ้งผลลัพธ์เก่าที่ตอบช้ากว่า
      setResults(r.ok ? (await r.json()).members : [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, org.id])

  async function refreshMembers() {
    const r = await fetch(`/api/org/orgs/${org.id}/members`)
    if (r.ok) setMembers((await r.json()).members)
  }

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

  async function invite(e) {
    e.preventDefault(); setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setNote(d.error || 'เชิญไม่สำเร็จ')
    setInviteEmail(''); setNote(`เชิญ ${d.invited.email} แล้ว`); refreshMembers()
  }

  async function changeRole(userId, role) {
    setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const d = await r.json()
    if (!r.ok) return setNote(d.error || 'เปลี่ยนบทบาทไม่สำเร็จ')
    setResults(rs => rs && rs.map(m => m.user_id === userId ? { ...m, role } : m))
    refreshMembers()
  }

  async function remove(userId, isSelf) {
    if (!confirm(isSelf ? 'ออกจากองค์กรนี้?' : 'ลบสมาชิกคนนี้?')) return
    setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/members/${userId}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return setNote(d.error || 'ลบไม่สำเร็จ')
    if (isSelf) { window.location.href = '/org'; return }
    setResults(null); setQuery(''); refreshMembers()
  }

  function memberRow(m) {
    const isSelf = m.user_id === me
    return (
      <li key={m.user_id} className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900 dark:text-disc-text">
            {m.display_name || m.email}{isSelf && <span className="text-gray-400"> (คุณ)</span>}
          </p>
          <p className="truncate text-xs text-gray-400 dark:text-disc-muted">
            {m.email}{m.status === 'invited' && ' · รอตอบรับ'}
          </p>
        </div>
        {isOwner ? (
          <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-2 py-1 text-xs text-gray-900 dark:text-disc-text">
            <option value="owner">owner</option>
            <option value="member">member</option>
          </select>
        ) : (
          <span className="text-xs text-gray-400 dark:text-disc-muted">{m.role}</span>
        )}
        {(isOwner || isSelf) && (
          <button onClick={() => remove(m.user_id, isSelf)}
            className="text-xs text-red-accent hover:underline">
            {isSelf ? 'ออก' : 'ลบ'}
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">ตั้งค่าองค์กร</h1>

      {/* ── ชื่อองค์กร ── */}
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

      {/* ── ทีมงาน / บทบาท (governance — ไม่ใช่ directory อาสาทั้ง org) ── */}
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">ทีมงาน / บทบาท</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-disc-muted">owner · คำเชิญค้าง · คนที่มีบทบาทพิเศษ — ค้นหาด้านล่างเพื่อจัดการสมาชิกคนอื่น</p>

        {isOwner && (
          <form onSubmit={invite} className="mt-3 flex gap-2">
            <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder="เชิญด้วยอีเมล"
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />
            <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">เชิญ</button>
          </form>
        )}

        <ul className="mt-3 divide-y divide-gray-100 dark:divide-disc-border">
          {members.map(memberRow)}
        </ul>
      </section>

      {/* ── ค้นหาสมาชิก ── */}
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">ค้นหาสมาชิก</p>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="ชื่อ หรือ อีเมล"
          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />

        {searching && <p className="mt-3 text-xs text-gray-400 dark:text-disc-muted">กำลังค้นหา…</p>}
        {!searching && results !== null && results.length === 0 && (
          <p className="mt-3 text-xs text-gray-400 dark:text-disc-muted">ไม่พบสมาชิก</p>
        )}
        {!searching && results !== null && results.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-disc-border">
            {results.map(memberRow)}
          </ul>
        )}
      </section>

      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}
