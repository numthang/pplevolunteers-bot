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
        <span className="text-xs text-gray-400 dark:text-disc-muted">{m.role}</span>
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

        {isOwner && <InviteLink orgId={org.id} />}

        <ul className="mt-3 divide-y divide-gray-100 dark:divide-disc-border">
          {members.map(memberRow)}
        </ul>
      </section>

      {/* ── ค้นหาสมาชิก: role + สิทธิ์ + ข้อมูลเข้าสู่ระบบ รวมเป็นจุดเดียว ── */}
      <UnifiedMemberSearch org={org} me={me} isOwner={isOwner} onNote={setNote} onChanged={refreshMembers} />

      {/* ── governance: ใครแต่งตั้งได้ (owner only) ── */}
      {isOwner && <AppointPolicy orgId={org.id} />}

      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}

// ── ลิงก์เชิญ (Notion-style): ลิงก์เดียวแชร์ได้ ใครเปิด+login ก็เข้าร่วม ──
function InviteLink({ orgId }) {
  const t = useTranslations('org')
  const [link, setLink] = useState(undefined) // undefined=loading · null=ไม่มี · obj=active
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/org/orgs/${orgId}/invite-link`)
      .then(r => r.ok ? r.json() : { link: null })
      .then(d => setLink(d.link))
      .catch(() => setLink(null))
  }, [orgId])

  const url = link ? `${window.location.origin}/join/${link.token}` : ''

  async function create() {
    setBusy(true)
    const r = await fetch(`/api/org/orgs/${orgId}/invite-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    if (r.ok) setLink((await r.json()).link)
    setBusy(false)
  }
  async function revoke() {
    if (!confirm(t('members.inviteLink.confirmRevoke'))) return
    setBusy(true)
    const r = await fetch(`/api/org/orgs/${orgId}/invite-link`, { method: 'DELETE' })
    if (r.ok) setLink(null)
    setBusy(false)
  }
  function copy() {
    navigator.clipboard?.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  if (link === undefined) return null

  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-disc-border p-3">
      <p className="text-xs font-medium text-gray-700 dark:text-disc-text">{t('members.inviteLink.title')}</p>
      {link ? (
        <>
          <div className="mt-2 flex gap-2">
            <input readOnly value={url} onFocus={e => e.target.select()}
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-gray-50 dark:bg-disc-bg2 px-3 py-2 text-xs text-gray-900 dark:text-disc-text" />
            <button onClick={copy}
              className="shrink-0 rounded-lg bg-orange px-3 py-2 text-xs font-semibold text-white">
              {copied ? t('members.inviteLink.copied') : t('members.inviteLink.copy')}
            </button>
          </div>
          <div className="mt-2 flex gap-4 text-xs">
            <button onClick={create} disabled={busy} className="text-gray-500 dark:text-disc-muted hover:underline disabled:opacity-40">{t('members.inviteLink.reset')}</button>
            <button onClick={revoke} disabled={busy} className="text-red-accent hover:underline disabled:opacity-40">{t('members.inviteLink.revoke')}</button>
          </div>
        </>
      ) : (
        <button onClick={create} disabled={busy}
          className="mt-2 rounded-lg bg-orange px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">
          {t('members.inviteLink.create')}
        </button>
      )}
      <p className="mt-2 text-xs text-gray-400 dark:text-disc-muted">{t('members.inviteLink.desc')}</p>
    </div>
  )
}

// ── ค้นหาสมาชิกรวม: role (ทุกคนที่ active มองเห็น) + permission chips (เฉพาะคน appoint ได้) + ── //
// ── แก้ไขข้อมูลเข้าสู่ระบบ (เฉพาะ owner) — หนึ่งกล่องค้นหา หนึ่ง list แทนที่เดิม 2 กล่องแยกกัน ── //
function UnifiedMemberSearch({ org, me, isOwner, onNote, onChanged }) {
  const t = useTranslations('org')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const seq = useRef(0)

  // catalog สิทธิ์ + canGrant ต่อผู้แต่งตั้งคนนี้ — probe /api/org/appoint (ไม่ใส่ q) → 200 = มีสิทธิ์แต่งตั้ง
  const [catalog, setCatalog] = useState([])
  const [appointReady, setAppointReady] = useState(false)
  const [openIdentity, setOpenIdentity] = useState(null) // user_id ที่กำลังเปิดแผงแก้ข้อมูลเข้าสู่ระบบ

  useEffect(() => {
    fetch('/api/org/appoint')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setCatalog(d.catalog || []); setAppointReady(true) })
      .catch(() => setAppointReady(false))
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    const my = ++seq.current
    const timer = setTimeout(async () => {
      const calls = [fetch(`/api/org/orgs/${org.id}/members?q=${encodeURIComponent(q)}`)]
      if (appointReady) calls.push(fetch(`/api/org/appoint?q=${encodeURIComponent(q)}`))
      const [roleRes, appointRes] = await Promise.all(calls)
      if (my !== seq.current) return

      const roleRows = roleRes.ok ? (await roleRes.json()).members : []
      const permByUser = new Map()
      if (appointRes?.ok) {
        for (const a of (await appointRes.json()).members) permByUser.set(a.id, a.permissions)
      }
      setResults(roleRows.map(m => ({ ...m, permissions: permByUser.get(m.user_id) || [] })))
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, org.id, appointReady])

  function patchRow(userId, patch) {
    setResults(rs => rs && rs.map(m => m.user_id === userId ? { ...m, ...patch } : m))
  }

  async function changeRole(userId, role) {
    onNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const d = await r.json()
    if (!r.ok) return onNote(d.error || t('members.changeRoleError'))
    patchRow(userId, { role })
    onChanged()
  }

  async function remove(userId, isSelf) {
    if (!confirm(isSelf ? t('members.confirmLeaveOrg') : t('members.confirmRemoveMember'))) return
    onNote('')
    const r = await fetch(`/api/org/orgs/${org.id}/members/${userId}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return onNote(d.error || t('members.removeError'))
    if (isSelf) { window.location.href = '/org'; return }
    setResults(null); setQuery(''); onChanged()
  }

  async function togglePermission(m, role, hasIt) {
    onNote('')
    const r = await fetch('/api/org/appoint', {
      method: hasIt ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: m.user_id, roleKey: role.key }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return onNote(d.error || t('members.appointError'))
    if (d.warning) onNote(d.warning)
    patchRow(m.user_id, {
      permissions: hasIt ? m.permissions.filter(p => p !== role.key) : [...m.permissions, role.key],
    })
  }

  return (
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
        <ul className="mt-3 space-y-3">
          {results.map(m => {
            const isSelf = m.user_id === me
            return (
              <li key={m.user_id} className="rounded-xl border border-gray-100 dark:border-disc-border p-3">
                <div className="flex items-center gap-3">
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
                </div>

                {appointReady && catalog.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {catalog.map(role => {
                      const hasIt = m.permissions.includes(role.key)
                      return (
                        <button key={role.key} disabled={!role.canGrant}
                          onClick={() => togglePermission(m, role, hasIt)}
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
                )}

                {isOwner && (
                  <div className="mt-2">
                    <button onClick={() => setOpenIdentity(openIdentity === m.user_id ? null : m.user_id)}
                      className="text-xs text-orange hover:underline">
                      {t('members.identity.toggleButton')}
                    </button>
                    {openIdentity === m.user_id && (
                      <IdentityEditor orgId={org.id} member={m} onNote={onNote}
                        onPhoneBound={phone => patchRow(m.user_id, { phone, phone_verified_at: new Date().toISOString() })}
                        onEmailLinkSent={() => onNote(t('members.identity.emailLinkSentMsg', { email: m.email }))} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ── แก้ไขข้อมูลเข้าสู่ระบบของสมาชิก (owner only) ──
// เบอร์: ต้องผ่าน OTP ที่ส่งถึงเบอร์ปลายทางจริง (owner ให้สมาชิกอ่านรหัสให้ฟัง แล้วมากรอก)
// email: owner ระบุ email ใหม่ → ระบบส่งลิงก์ยืนยันไปที่ inbox นั้น → เขียนจริงตอนสมาชิกกดลิงก์เอง
// ทั้งคู่ "พิสูจน์ว่าถึงมือเจ้าตัวจริง" ก่อนเขียนเสมอ — ไม่ใช่ owner พิมพ์แล้ว save ตรงๆ
function IdentityEditor({ orgId, member, onNote, onPhoneBound, onEmailLinkSent }) {
  const t = useTranslations('org')
  const base = `/api/org/orgs/${orgId}/members/${member.user_id}`

  const [phone, setPhone] = useState(member.phone || '')
  const [otp, setOtp] = useState('')
  const [ref, setRef] = useState('')
  const [phoneStage, setPhoneStage] = useState('idle') // idle | sent
  const [phoneBusy, setPhoneBusy] = useState(false)

  const [newEmail, setNewEmail] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function sendOtp() {
    setPhoneBusy(true); onNote('')
    const r = await fetch(`${base}/phone/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
    })
    const d = await r.json().catch(() => ({}))
    setPhoneBusy(false)
    if (!r.ok) return onNote(d.error || t('members.identity.otpSendError'))
    setRef(d.ref); setPhoneStage('sent')
  }

  async function verifyOtp() {
    setPhoneBusy(true); onNote('')
    const r = await fetch(`${base}/phone/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp }),
    })
    const d = await r.json().catch(() => ({}))
    setPhoneBusy(false)
    if (!r.ok) return onNote(d.error || t('members.identity.otpVerifyError'))
    setOtp(''); setPhoneStage('idle')
    onPhoneBound(phone)
    onNote(t('members.identity.phoneBoundMsg'))
  }

  async function sendEmailLink() {
    setEmailBusy(true); onNote('')
    const r = await fetch(`${base}/email/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail }),
    })
    const d = await r.json().catch(() => ({}))
    setEmailBusy(false)
    if (!r.ok) return onNote(d.error || t('members.identity.emailSendError'))
    setEmailSent(true)
    onEmailLinkSent()
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-200 dark:border-disc-border p-3">
      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-disc-text">{t('members.identity.phoneLabel')}</p>
        <p className="text-xs text-gray-400 dark:text-disc-muted">
          {member.phone_verified_at
            ? t('members.identity.phoneCurrentVerified', { phone: member.phone })
            : t('members.identity.phoneCurrentUnverified')}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('members.identity.phoneHint')}</p>
        <div className="mt-1.5 flex gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812345678"
            disabled={phoneStage === 'sent'}
            className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-1.5 text-xs text-gray-900 dark:text-disc-text disabled:opacity-60" />
          {phoneStage === 'idle' ? (
            <button onClick={sendOtp} disabled={phoneBusy || !phone}
              className="shrink-0 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {t('members.identity.sendOtpButton')}
            </button>
          ) : (
            <button onClick={() => setPhoneStage('idle')} className="shrink-0 text-xs text-gray-500 dark:text-disc-muted hover:underline">
              {t('members.identity.cancelButton')}
            </button>
          )}
        </div>
        {phoneStage === 'sent' && (
          <div className="mt-1.5 flex gap-2">
            <input value={otp} onChange={e => setOtp(e.target.value)}
              placeholder={t('members.identity.otpPlaceholder', { ref })}
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-1.5 text-xs text-gray-900 dark:text-disc-text" />
            <button onClick={verifyOtp} disabled={phoneBusy || otp.length !== 6}
              className="shrink-0 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {t('members.identity.confirmButton')}
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-disc-text">{t('members.identity.emailLabel')}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('members.identity.emailHint')}</p>
        <div className="mt-1.5 flex gap-2">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            placeholder="name@example.com" disabled={emailSent}
            className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-1.5 text-xs text-gray-900 dark:text-disc-text disabled:opacity-60" />
          <button onClick={sendEmailLink} disabled={emailBusy || !newEmail || emailSent}
            className="shrink-0 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            {emailSent ? t('members.identity.linkSentButton') : t('members.identity.sendLinkButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
