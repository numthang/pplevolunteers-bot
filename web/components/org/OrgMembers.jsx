'use client'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import AppointPolicy from './AppointPolicy.jsx'

export default function OrgMembers({ org, members: initial, me, myRole }) {
  const t = useTranslations('org')
  const isOwner = myRole === 'owner'
  const [members, setMembers] = useState(initial)
  const [inviteEmail, setInviteEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // ── Section A: ค้นหาสมาชิก (จัดการ membership) ──
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    const my = ++seq.current
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/org/orgs/${org.id}/members?q=${encodeURIComponent(q)}`)
      if (my !== seq.current) return
      setResults(r.ok ? (await r.json()).members : [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, org.id])

  async function refreshMembers() {
    const r = await fetch(`/api/org/orgs/${org.id}/members`)
    if (r.ok) setMembers((await r.json()).members)
  }

  async function invite(e) {
    e.preventDefault(); setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/invite`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    const d = await r.json(); setBusy(false)
    if (!r.ok) return setNote(d.error || t('members.inviteError'))
    setInviteEmail('')
    setNote(d.emailSent
      ? t('members.inviteSuccessEmailSent', { email: d.invited.email })
      : t('members.inviteSuccessNoSmtp', { email: d.invited.email }))
    refreshMembers()
  }

  async function changeRole(userId, role) {
    setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const d = await r.json()
    if (!r.ok) return setNote(d.error || t('members.changeRoleError'))
    setResults(rs => rs && rs.map(m => m.user_id === userId ? { ...m, role } : m))
    refreshMembers()
  }

  async function remove(userId, isSelf) {
    if (!confirm(isSelf ? t('members.confirmLeaveOrg') : t('members.confirmRemoveMember'))) return
    setNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/members/${userId}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return setNote(d.error || t('members.removeError'))
    if (isSelf) { window.location.href = '/org'; return }
    setResults(null); setQuery(''); refreshMembers()
  }

  function memberRow(m) {
    const isSelf = m.user_id === me
    return (
      <li key={m.user_id} className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-gray-900 dark:text-disc-text">
            {m.display_name || m.email}{isSelf && <span className="text-gray-400">{t('members.youSuffix')}</span>}
          </p>
          <p className="truncate text-xs text-gray-400 dark:text-disc-muted">
            {m.email}{m.status === 'invited' && t('members.pendingInviteSuffix')}
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
            {isSelf ? t('members.leaveButton') : t('members.removeButton')}
          </button>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── ทีมงาน / บทบาท (governance) ── */}
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('members.teamTitle')}</p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-disc-muted">{t('members.teamDesc')}</p>

        {isOwner && (
          <form onSubmit={invite} className="mt-3 flex gap-2">
            <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              placeholder={t('members.inviteEmailPlaceholder')}
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />
            <button disabled={busy} className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{t('members.inviteButton')}</button>
          </form>
        )}

        <ul className="mt-3 divide-y divide-gray-100 dark:divide-disc-border">
          {members.map(memberRow)}
        </ul>
      </section>

      {/* ── ค้นหาสมาชิก (membership) ── */}
      <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
        <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('members.searchTitle')}</p>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('members.searchPlaceholder')}
          className="mt-2 w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />

        {searching && <p className="mt-3 text-xs text-gray-400 dark:text-disc-muted">{t('members.searching')}</p>}
        {!searching && results !== null && results.length === 0 && (
          <p className="mt-3 text-xs text-gray-400 dark:text-disc-muted">{t('members.noResults')}</p>
        )}
        {!searching && results !== null && results.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100 dark:divide-disc-border">
            {results.map(memberRow)}
          </ul>
        )}
      </section>

      {/* ── แต่งตั้งบทบาท (permission — gated ด้วย appoint policy) ── */}
      <AppointSection orgId={org.id} onNote={setNote} />

      {/* ── governance: ใครแต่งตั้งได้ (owner only) ── */}
      {isOwner && <AppointPolicy orgId={org.id} />}

      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}

// ── Section B: แต่งตั้ง permission role ──
// probe /api/org/appoint (no q) → 200 = มีสิทธิ์แต่งตั้ง (โชว์ section) · 403 = ซ่อน
function AppointSection({ orgId, onNote }) {
  const t = useTranslations('org')
  const [ready, setReady] = useState(null) // null=probing · false=ไม่มีสิทธิ์ · true=โชว์
  const [catalog, setCatalog] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    fetch('/api/org/appoint')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setCatalog(d.catalog || []); setReady(true) })
      .catch(() => setReady(false))
  }, [])

  useEffect(() => {
    if (!ready) return
    const q = query.trim()
    if (q.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    const my = ++seq.current
    const timer = setTimeout(async () => {
      const r = await fetch(`/api/org/appoint?q=${encodeURIComponent(q)}`)
      if (my !== seq.current) return
      setResults(r.ok ? (await r.json()).members : [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, ready])

  async function toggle(m, role, hasIt) {
    onNote('')
    const r = await fetch('/api/org/appoint', {
      method: hasIt ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: m.id, roleKey: role.key }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return onNote(d.error || t('members.appointError'))
    setResults(rs => rs && rs.map(x => x.id === m.id
      ? { ...x, permissions: hasIt ? x.permissions.filter(p => p !== role.key) : [...x.permissions, role.key] }
      : x))
  }

  if (!ready) return null

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5">
      <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{t('members.appointTitle')}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-disc-muted">{t('members.appointDesc')}</p>
      <input value={query} onChange={e => setQuery(e.target.value)}
        placeholder={t('members.appointSearchPlaceholder')}
        className="mt-2 w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text" />

      {searching && <p className="mt-3 text-xs text-gray-400 dark:text-disc-muted">{t('members.searching')}</p>}
      {!searching && results !== null && results.length === 0 && (
        <p className="mt-3 text-xs text-gray-400 dark:text-disc-muted">{t('members.noResults')}</p>
      )}
      {!searching && results !== null && results.length > 0 && (
        <ul className="mt-3 space-y-3">
          {results.map(m => (
            <li key={m.id} className="rounded-xl border border-gray-100 dark:border-disc-border p-3">
              <p className="truncate text-sm text-gray-900 dark:text-disc-text">{m.label}</p>
              {m.sub && <p className="truncate text-xs text-gray-400 dark:text-disc-muted">{m.sub}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {catalog.map(role => {
                  const hasIt = m.permissions.includes(role.key)
                  return (
                    <button key={role.key} disabled={!role.canGrant}
                      onClick={() => toggle(m, role, hasIt)}
                      className={`rounded-full px-2.5 py-1 text-xs border ${
                        hasIt
                          ? 'bg-orange text-white border-orange'
                          : 'bg-transparent text-gray-600 dark:text-disc-muted border-gray-300 dark:border-disc-border'
                      } ${role.canGrant ? 'hover:opacity-80' : 'opacity-40 cursor-not-allowed'}`}>
                      {role.label}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
