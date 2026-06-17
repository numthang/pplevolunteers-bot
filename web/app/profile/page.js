'use client'
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Copy, Check, Link2, Unlink, KeyRound } from 'lucide-react'
import { startRegistration } from '@simplewebauthn/browser'

const FIELDS = [
  { key: 'nickname',   label: 'ชื่อเล่น',              placeholder: 'เช่น แมว' },
  { key: 'firstname',  label: 'ชื่อจริง',               placeholder: '' },
  { key: 'lastname',   label: 'นามสกุล',               placeholder: '' },
  { key: 'member_id',  label: 'หมายเลขสมาชิกพรรค',     placeholder: '' },
  { key: 'specialty',  label: 'ความเชี่ยวชาญ',          placeholder: 'เช่น กฎหมาย, การเงิน, IT' },
  { key: 'amphoe',     label: 'อำเภอ',                  placeholder: '' },
  { key: 'phone',      label: 'เบอร์โทร',               placeholder: '08x-xxx-xxxx' },
  { key: 'line_id',    label: 'Line ID',                placeholder: '' },
  { key: 'google_id',  label: 'Google Email',           placeholder: '' },
]

const BANK_FIELDS = [
  { key: 'bank_name',     label: 'ธนาคาร',              placeholder: 'เช่น กรุงไทย, กสิกร' },
  { key: 'account_no',    label: 'เลขบัญชี',            placeholder: '1234567890' },
  { key: 'account_holder', label: 'ชื่อบัญชี',          placeholder: '' },
]

const EMPTY = Object.fromEntries(FIELDS.map(f => [f.key, '']))

export default function ProfilePage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [form, setForm] = useState(EMPTY)
  const [readOnly, setReadOnly] = useState({})
  const [primaryProvince, setPrimaryProvince] = useState('')
  const [provinceOptions, setProvinceOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'personal')
  const [expandRoles, setExpandRoles] = useState(false)
  const [copied, setCopied] = useState(false)
  const [identities, setIdentities] = useState([])
  const [identityMsg, setIdentityMsg] = useState(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  const loadIdentities = useCallback(() => {
    fetch('/api/identities').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setIdentities(data)
    }).catch(() => {})
  }, [])

  function load() {
    fetch('/api/profile')
      .then(r => r.json())
      .then(data => {
        setForm(prev => {
          const next = { ...prev }
          for (const f of FIELDS) next[f.key] = data[f.key] || ''
          return next
        })
        setReadOnly({
          username:     data.username || '',
          display_name: data.display_name || '',
          province:     data.province || '',
          region:       data.region || '',
          roles:        data.roles || '',
          interests:    data.interests || '',
        })
        setPrimaryProvince(data.primary_province || '')
        setProvinceOptions(data.province_options || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    load()
    loadIdentities()
    // แสดงผลจาก link/unlink redirect
    const success = searchParams.get('link_success')
    const linkErr = searchParams.get('link_error')
    if (success) {
      setIdentityMsg({ type: 'success', text: `ผูกบัญชี ${success.toUpperCase()} สำเร็จ` })
      setActiveTab('security')
    }
    if (linkErr) {
      const errText = linkErr === 'already_taken'
        ? 'บัญชีนี้ถูกผูกกับ Discord account อื่นไปแล้ว'
        : `ผูกบัญชีไม่สำเร็จ (${linkErr})`
      setIdentityMsg({ type: 'error', text: errText })
      setActiveTab('security')
    }
  }, [status])

  useEffect(() => {
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [])

  async function registerPasskey() {
    setPasskeyBusy(true); setIdentityMsg(null)
    try {
      const optRes = await fetch('/api/link/passkey/register')
      const options = await optRes.json()
      const attResp = await startRegistration({ optionsJSON: options })
      const verRes = await fetch('/api/link/passkey/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      })
      if (!verRes.ok) throw new Error((await verRes.json()).error)
      setIdentityMsg({ type: 'success', text: 'ลงทะเบียน Passkey สำเร็จ' })
      loadIdentities()
    } catch (err) {
      setIdentityMsg({ type: 'error', text: err.message || 'ลงทะเบียน Passkey ไม่สำเร็จ' })
    }
    setPasskeyBusy(false)
  }

  async function unlink(provider, providerId) {
    if (!confirm(`ยืนยันการยกเลิกการผูกบัญชี ${provider.toUpperCase()}?`)) return
    setIdentityMsg(null)
    const res = await fetch('/api/unlink', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, provider_id: providerId }),
    })
    const d = await res.json()
    if (!res.ok) { setIdentityMsg({ type: 'error', text: d.error }); return }
    setIdentityMsg({ type: 'success', text: `ยกเลิกการผูก ${provider.toUpperCase()} แล้ว` })
    loadIdentities()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, primary_province: primaryProvince || null }),
      })
      if (!res.ok) throw new Error()
      await update()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('บันทึกไม่สำเร็จ กรุณาลองใหม่')
    }
    setSaving(false)
  }

  if (status === 'loading' || loading) {
    return <div className="py-16 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6 text-warm-900 dark:text-disc-text">แก้ไขโปรไฟล์</h1>

      {/* Discord info */}
      {session && (
        <div className="flex items-start gap-3 mb-3 p-4 bg-card-bg rounded-xl border-2 border-brand-orange">
          {session.user.image && (
            <Image src={session.user.image} alt="" width={48} height={48} className="rounded-full shrink-0 mt-1" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-warm-900 dark:text-disc-text text-base truncate">
              {readOnly.display_name && readOnly.display_name !== session.user.name
                ? readOnly.display_name
                : session.user.name}
              <span className="text-warm-500 dark:text-disc-muted ml-2">ID: {session.user.discordId}</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-base text-warm-500 dark:text-disc-muted">
                @{session.user.name}
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(session.user.name)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text transition"
              >
                {copied ? (
                  <>
                    <Check size={14} />
                    <span>คัดลอกแล้ว</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>คัดลอก</span>
                  </>
                )}
              </button>
            </div>
            {readOnly.roles && (
              <div className="flex items-center gap-2">
                <p className={`text-base text-warm-500 dark:text-disc-text ${expandRoles ? '' : 'truncate'}`}>
                  <span className="font-medium">ยศ:</span>{' '}
                  {readOnly.roles.split(',').map(r => r.trim()).filter(Boolean).join(' · ')}
                </p>
                <button
                  type="button"
                  onClick={() => setExpandRoles(!expandRoles)}
                  className="shrink-0 text-base text-brand-orange hover:text-brand-orange-light transition"
                >
                  {expandRoles ? '▼' : '▶'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-warm-200 dark:border-disc-border">
        {[['personal','ข้อมูลส่วนตัว'],['bank','ข้อมูลการเงิน'],['security','บัญชีที่ผูก']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-base font-medium border-b-2 transition ${
              activeTab === id
                ? 'border-brand-orange text-brand-orange'
                : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
            }`}
          >{label}</button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Personal Info Tab */}
        {activeTab === 'personal' && (
          <div className="flex flex-col gap-4">
            {FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-base font-medium text-warm-500 dark:text-disc-text mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-base placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange transition"
                />
              </div>
            ))}

            {provinceOptions.length > 0 && (
              <div>
                <label className="block text-base font-medium text-warm-500 dark:text-disc-text mb-1">
                  จังหวัดหลัก (Primary Province)
                </label>
                <select
                  value={primaryProvince}
                  onChange={e => setPrimaryProvince(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-base focus:outline-none focus:ring-2 focus:ring-brand-orange transition"
                >
                  <option value="">— ไม่ระบุ —</option>
                  {provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <p className="text-xs text-warm-400 dark:text-disc-muted mt-1">ใช้เป็นค่า default เมื่อเพิ่ม Contact ใหม่</p>
              </div>
            )}
          </div>
        )}

        {/* Bank Info Tab */}
        {activeTab === 'bank' && (
          <div className="flex flex-col gap-4">
            {BANK_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-base font-medium text-warm-500 dark:text-disc-text mb-1">
                  {label}
                </label>
                <input
                  type="text"
                  value={form[key] || ''}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-base placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange transition"
                />
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-base text-red-500">{error}</p>}

        {activeTab !== 'security' && (
          <button
            type="submit"
            disabled={saving}
            className="mt-2 bg-brand-orange hover:bg-brand-orange-light disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึก'}
          </button>
        )}
      </form>

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="flex flex-col gap-3 mt-2">
          {identityMsg && (
            <div className={`px-4 py-3 rounded-lg text-sm text-center ${
              identityMsg.type === 'success'
                ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {identityMsg.text}
            </div>
          )}

          {/* LINE */}
          {(() => {
            const linked = identities.find(i => i.provider === 'line')
            const lineIcon = (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#06C755">
                <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
            )
            if (!linked) return (
              <a href="/api/link/line" className="flex items-center justify-between px-4 py-4 rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover transition cursor-pointer">
                <div className="flex items-center gap-3">
                  {lineIcon}
                  <div>
                    <p className="text-warm-900 dark:text-disc-text text-sm font-medium">LINE</p>
                    <p className="text-brand-orange text-sm font-medium mt-0.5">ผูกบัญชี</p>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="text-warm-400 dark:text-disc-muted"><path d="M9 18l6-6-6-6"/></svg>
              </a>
            )
            return (
              <div className="flex items-center justify-between px-4 py-4 rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 shrink-0">
                    <Check size={11} strokeWidth={3} className="text-white" />
                  </span>
                  {lineIcon}
                  <div>
                    <p className="text-warm-900 dark:text-disc-text text-sm font-medium">LINE</p>
                    <p className="text-green-500 dark:text-green-400 text-xs mt-0.5">ผูกแล้ว</p>
                  </div>
                </div>
                <button onClick={() => unlink('line', linked.provider_id)} className="text-warm-400 dark:text-disc-muted text-xs hover:text-red-500 dark:hover:text-red-400 transition flex items-center gap-1"><Unlink size={12} /> ยกเลิก</button>
              </div>
            )
          })()}

          {/* Google */}
          {(() => {
            const linked = identities.find(i => i.provider === 'google')
            const googleIcon = (
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )
            if (!linked) return (
              <a href="/api/link/google" className="flex items-center justify-between px-4 py-4 rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover transition cursor-pointer">
                <div className="flex items-center gap-3">
                  {googleIcon}
                  <div>
                    <p className="text-warm-900 dark:text-disc-text text-sm font-medium">Google</p>
                    <p className="text-brand-orange text-sm font-medium mt-0.5">ผูกบัญชี</p>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="text-warm-400 dark:text-disc-muted"><path d="M9 18l6-6-6-6"/></svg>
              </a>
            )
            return (
              <div className="flex items-center justify-between px-4 py-4 rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 shrink-0">
                    <Check size={11} strokeWidth={3} className="text-white" />
                  </span>
                  {googleIcon}
                  <div>
                    <p className="text-warm-900 dark:text-disc-text text-sm font-medium">Google</p>
                    <p className="text-green-500 dark:text-green-400 text-xs mt-0.5">ผูกแล้ว</p>
                  </div>
                </div>
                <button onClick={() => unlink('google', linked.provider_id)} className="text-warm-400 dark:text-disc-muted text-xs hover:text-red-500 dark:hover:text-red-400 transition flex items-center gap-1"><Unlink size={12} /> ยกเลิก</button>
              </div>
            )
          })()}

          {/* Passkey */}
          <div className="rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg overflow-hidden">
            <button onClick={registerPasskey} disabled={passkeyBusy}
              className="w-full flex items-center justify-between px-4 py-4 hover:bg-warm-50 dark:hover:bg-disc-hover transition disabled:opacity-40">
              <div className="flex items-center gap-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" className="text-warm-400 dark:text-disc-muted">
                  <circle cx="8" cy="15" r="4"/><path d="M10.85 12A7 7 0 0 1 23 13v1"/><path d="M18 12v5"/><path d="M21 15h-6"/>
                </svg>
                <div className="text-left">
                  <p className="text-warm-900 dark:text-disc-text text-sm font-medium">Passkey</p>
                  <p className="text-brand-orange text-sm font-medium mt-0.5">
                    {passkeyBusy ? 'กำลังลงทะเบียน...' : 'เพิ่มอุปกรณ์'}
                  </p>
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" stroke="currentColor" className="text-warm-400 dark:text-disc-muted"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            {identities.filter(i => i.provider === 'passkey').map(p => (
              <div key={p.provider_id} className="flex items-center justify-between px-4 py-2.5 border-t border-warm-100 dark:border-disc-border">
                <span className="text-warm-500 dark:text-disc-muted text-xs">🔑 {p.device_name || (p.transports?.includes('usb') ? 'Security Key' : p.transports?.includes('hybrid') || p.transports?.includes('cable') ? 'Passkey ต่างอุปกรณ์' : p.device_type === 'singleDevice' ? 'อุปกรณ์นี้' : 'Passkey')} <span className="font-mono text-warm-400 dark:text-disc-muted">#{p.provider_id.slice(-8)}</span> · {new Date(p.created_at).toLocaleDateString('th-TH')}</span>
                <button onClick={() => unlink('passkey', p.provider_id)} className="text-warm-400 dark:text-disc-muted text-xs hover:text-red-500 dark:hover:text-red-400 transition flex items-center gap-1"><Unlink size={11} /> ลบ</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
