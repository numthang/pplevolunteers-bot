'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trash2, RefreshCw, Globe, Lock, AlertTriangle, X, Plus, Settings, Check } from 'lucide-react'
import { isAdmin } from '@/lib/roles.js'

const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: 'Threads', x: 'X (Twitter)' }
const PLATFORM_COLOR = {
  fb:      'bg-blue-600 text-white',
  ig:      'bg-gradient-to-r from-purple-500 to-orange-400 text-white',
  threads: 'bg-gray-800 text-white dark:bg-gray-700',
  x:       'bg-black text-white',
}

function TokenExpiry({ expiresAt }) {
  if (!expiresAt) return null
  const msLeft = new Date(expiresAt).getTime() - Date.now()
  const days = Math.floor(msLeft / 86400000)
  if (days < 0) return (
    <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 font-medium">
      <AlertTriangle size={12} /> Token หมดอายุแล้ว
    </span>
  )
  if (days <= 7) return (
    <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
      <AlertTriangle size={12} /> หมดอายุใน {days} วัน
    </span>
  )
  return (
    <span className="text-xs text-green-600 dark:text-green-400">Token อีก {days} วัน</span>
  )
}

const EMPTY_X_FORM = { name: '', handle: '', access_token: '', access_token_secret: '' }

export default function SocialAccountsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState([])
  const [guilds, setGuilds] = useState([])
  const [configs, setConfigs] = useState({}) // { [guild_id]: { meta_app_id, meta_app_secret, x_consumer_key, x_consumer_secret } }
  const [editConfig, setEditConfig] = useState(null) // { guildId, key, value }
  const [savingConfig, setSavingConfig] = useState(false)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [xModal, setXModal] = useState(null) // { guildId }
  const [xForm, setXForm] = useState(EMPTY_X_FORM)
  const [xSaving, setXSaving] = useState(false)
  const [banner, setBanner] = useState(null)

  const roles = Array.isArray(session?.user?.roles) ? session.user.roles : []
  const admin = isAdmin(roles)

  const load = useCallback(async () => {
    const [accRes, gRes, cfgRes] = await Promise.all([
      fetch('/api/social/accounts'),
      fetch('/api/admin/guilds'),
      fetch('/api/social/guild-configs'),
    ])
    if (accRes.ok) setAccounts(await accRes.json())
    if (gRes.ok) setGuilds(await gRes.json())
    if (cfgRes.ok) setConfigs(await cfgRes.json())
    setLoading(false)
  }, [])

  async function saveConfig() {
    if (!editConfig) return
    setSavingConfig(true)
    const res = await fetch('/api/social/guild-configs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild_id: editConfig.guildId, key: editConfig.key, value: editConfig.value }),
    })
    if (res.ok) {
      setConfigs(prev => ({
        ...prev,
        [editConfig.guildId]: { ...(prev[editConfig.guildId] || {}), [editConfig.key]: editConfig.value || undefined }
      }))
      setEditConfig(null)
    }
    setSavingConfig(false)
  }

  useEffect(() => {
    if (!editConfig) return
    const onKey = e => { if (e.key === 'Escape') setEditConfig(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editConfig])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') load()
  }, [status, load, router])

  async function toggleVisibility(acc) {
    const next = acc.visibility === 'public' ? 'private' : 'public'
    await fetch(`/api/social/accounts/${acc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility: next }),
    })
    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, visibility: next } : a))
  }

  async function remove(id) {
    if (!confirm('ลบ account นี้?')) return
    setDeleting(id)
    await fetch(`/api/social/accounts/${id}`, { method: 'DELETE' })
    setAccounts(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  async function saveX(e) {
    e.preventDefault()
    const { name, handle, access_token, access_token_secret } = xForm
    if (!handle || !access_token || !access_token_secret) return
    setXSaving(true)
    const creds = JSON.stringify({ access_token, access_token_secret })
    const res = await fetch('/api/social/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guild_id: xModal.guildId,
        platform: 'x',
        social_id: handle.replace(/^@/, ''),
        name: name || handle,
        access_token: creds,
      }),
    })
    if (res.ok) {
      await load()
      setXModal(null)
      setXForm(EMPTY_X_FORM)
    }
    setXSaving(false)
  }

  useEffect(() => {
    if (!xModal) return
    const onKey = e => { if (e.key === 'Escape') setXModal(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [xModal])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const account   = searchParams.get('account')
    const error     = searchParams.get('error')
    if (connected) setBanner({ type: 'success', msg: `เชื่อมต่อ @${account} สำเร็จแล้ว` })
    if (error === 'denied') setBanner({ type: 'error', msg: 'ยกเลิก OAuth' })
    if (error && error !== 'denied') setBanner({ type: 'error', msg: `เชื่อมต่อไม่สำเร็จ (${error})` })
  }, [searchParams])

  if (status === 'loading' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  if (!admin) {
    return <p className="text-red-500 text-sm">ต้องเป็น Admin เท่านั้น</p>
  }

  // group accounts by guild_id
  const byGuild = {}
  for (const acc of accounts) {
    const key = acc.guild_id || '__none__'
    if (!byGuild[key]) byGuild[key] = []
    byGuild[key].push(acc)
  }

  const guildMap = Object.fromEntries(guilds.map(g => [g.guild_id, g.name]))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">Social Accounts</h1>
          <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">บัญชี Facebook / Instagram / Threads ที่เชื่อมต่อกับ bot</p>
        </div>
      </div>

      {banner && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
          {banner.msg}
          <button onClick={() => setBanner(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {guilds.length === 0 && accounts.length === 0 && (
        <p className="text-warm-500 dark:text-disc-muted text-sm">ยังไม่มี account ที่เชื่อมต่อ</p>
      )}

      <div className="flex flex-col gap-8">
        {guilds.map(guild => {
          const gAccounts = byGuild[guild.guild_id] || []
          const cfg = configs[guild.guild_id] || {}
          const hasMeta = !!cfg.meta_app_id && !!cfg.meta_app_secret
          const hasX    = !!cfg.x_consumer_key && !!cfg.x_consumer_secret
          return (
            <div key={guild.guild_id}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide">
                  {guild.name}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setXModal({ guildId: guild.guild_id }); setXForm(EMPTY_X_FORM) }}
                    disabled={!hasX}
                    title={hasX ? '' : 'ตั้งค่า X Consumer Key/Secret ก่อน'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-sm hover:opacity-80 transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus size={14} />
                    X (Guild)
                  </button>
                  {hasX ? (
                    <a
                      href={`/api/x/oauth/start?guild_id=${guild.guild_id}&visibility=private`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm hover:opacity-80 transition"
                    >
                      <Lock size={14} />
                      X (ส่วนตัว)
                    </a>
                  ) : (
                    <button disabled title="ตั้งค่า X Consumer Key/Secret ก่อน" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm opacity-30 cursor-not-allowed">
                      <Lock size={14} />
                      X (ส่วนตัว)
                    </button>
                  )}
                  {hasMeta ? (
                    <a
                      href={`/api/meta/oauth/start?guild_id=${guild.guild_id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm hover:opacity-90 transition"
                    >
                      <RefreshCw size={14} />
                      Connect Meta OAuth
                    </a>
                  ) : (
                    <button disabled title="ตั้งค่า Meta App ID/Secret ก่อน" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm opacity-30 cursor-not-allowed">
                      <RefreshCw size={14} />
                      Connect Meta OAuth
                    </button>
                  )}
                </div>
              </div>

              {/* App Credentials */}
              <div className="bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-4 mb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Settings size={14} className="text-gray-500 dark:text-disc-muted" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-disc-text uppercase tracking-wide">App Credentials</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { key: 'meta_app_id',       label: 'Meta App ID',       secret: false },
                    { key: 'meta_app_secret',   label: 'Meta App Secret',   secret: true  },
                    { key: 'x_consumer_key',    label: 'X Consumer Key',    secret: false },
                    { key: 'x_consumer_secret', label: 'X Consumer Secret', secret: true  },
                  ].map(({ key, label, secret }) => {
                    const val = cfg[key]
                    const display = !val ? '—' : secret ? '••••••••' : (val.length > 24 ? val.slice(0, 12) + '…' + val.slice(-6) : val)
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-gray-500 dark:text-disc-muted w-36 shrink-0">{label}</span>
                        <span className={`flex-1 font-mono text-xs ${val ? 'text-gray-700 dark:text-disc-text' : 'text-gray-400 dark:text-disc-muted'}`}>{display}</span>
                        <button
                          onClick={() => setEditConfig({ guildId: guild.guild_id, key, value: val || '' })}
                          className="text-xs text-orange hover:underline shrink-0"
                        >
                          {val ? 'แก้ไข' : 'ตั้งค่า'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              {gAccounts.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-disc-muted pl-1">ยังไม่มีบัญชี</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {gAccounts.map(acc => (
                    <div
                      key={acc.id}
                      className="bg-card-bg rounded-xl px-4 py-3 flex items-center gap-3 border border-warm-200 dark:border-disc-border"
                    >
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${PLATFORM_COLOR[acc.platform] || 'bg-gray-500 text-white'}`}>
                        {PLATFORM_LABEL[acc.platform] || acc.platform}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-disc-text">{acc.name}</p>
                        <p className="text-xs text-gray-400 dark:text-disc-muted font-mono">{acc.social_id}</p>
                        {acc.platform === 'ig' && (
                          <TokenExpiry expiresAt={acc.user_token_expires_at} />
                        )}
                        {acc.platform === 'ig' && !acc.has_user_token && (
                          <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                            <AlertTriangle size={12} /> ไม่มี User Token — กด Connect ใหม่
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => toggleVisibility(acc)}
                        title={acc.visibility === 'public' ? 'สาธารณะ (คลิกเพื่อตั้งเป็นส่วนตัว)' : 'ส่วนตัว (คลิกเพื่อตั้งเป็นสาธารณะ)'}
                        className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-md transition ${
                          acc.visibility === 'public'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                            : 'bg-gray-100 text-gray-500 dark:bg-disc-hover dark:text-disc-muted hover:bg-gray-200 dark:hover:bg-disc-border'
                        }`}
                      >
                        {acc.visibility === 'public' ? <Globe size={12} /> : <Lock size={12} />}
                        {acc.visibility === 'public' ? 'สาธารณะ' : 'ส่วนตัว'}
                      </button>

                      <button
                        onClick={() => remove(acc.id)}
                        disabled={deleting === acc.id}
                        className="shrink-0 p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditConfig(null)}>
          <div className="bg-white dark:bg-disc-bg2 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-disc-text">
                {{
                  meta_app_id:       'Meta App ID',
                  meta_app_secret:   'Meta App Secret',
                  x_consumer_key:    'X Consumer Key',
                  x_consumer_secret: 'X Consumer Secret',
                }[editConfig.key]}
              </h2>
              <button onClick={() => setEditConfig(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-disc-text">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={e => { e.preventDefault(); saveConfig() }} className="flex flex-col gap-3">
              <input
                type={editConfig.key.endsWith('_secret') ? 'password' : 'text'}
                value={editConfig.value}
                onChange={e => setEditConfig(prev => ({ ...prev, value: e.target.value }))}
                placeholder="ใส่ค่าที่นี่ (ปล่อยว่างเพื่อลบ)"
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange/40"
              />
              <p className="text-xs text-gray-400 dark:text-disc-muted">
                ดูค่าได้จาก {editConfig.key.startsWith('meta_') ? 'Meta Developer Portal → My Apps' : 'X Developer Portal → Keys and Tokens'}
              </p>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setEditConfig(null)} className="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover transition">
                  ยกเลิก
                </button>
                <button type="submit" disabled={savingConfig} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
                  <Check size={14} />
                  {savingConfig ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {xModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setXModal(null)}>
          <div className="bg-white dark:bg-disc-bg2 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-disc-text">เพิ่ม X (Twitter) Account</h2>
              <button onClick={() => setXModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-disc-text">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveX} className="flex flex-col gap-3">
              {[
                { key: 'name',                 label: 'ชื่อที่แสดง',             placeholder: 'เช่น Peoples Volunteers X', required: false },
                { key: 'handle',               label: 'X Handle',               placeholder: '@pple_volunteers', required: true },
                { key: 'access_token',         label: 'Access Token',            placeholder: '', required: true },
                { key: 'access_token_secret',  label: 'Access Token Secret',     placeholder: '', required: true },
              ].map(({ key, label, placeholder, required }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 dark:text-disc-text mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
                  <input
                    type={['access_token','access_token_secret'].includes(key) ? 'password' : 'text'}
                    value={xForm[key]}
                    onChange={e => setXForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    required={required}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white/30"
                  />
                </div>
              ))}

              <p className="text-xs text-gray-400 dark:text-disc-muted mt-1">
                ดู credentials ได้ที่ X Developer Portal → Your App → Keys and Tokens
              </p>

              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setXModal(null)} className="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover transition">
                  ยกเลิก
                </button>
                <button type="submit" disabled={xSaving} className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:opacity-80 transition disabled:opacity-40">
                  {xSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
