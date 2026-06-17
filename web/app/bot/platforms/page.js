'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trash2, RefreshCw, Globe, Lock, AlertTriangle, X, Settings, Check } from 'lucide-react'
import { canManageSocialGuild } from '@/lib/roles.js'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'

const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: '@ (Threads)', x: 'X (Twitter)' }
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
  return <span className="text-xs text-green-600 dark:text-green-400">Token อีก {days} วัน</span>
}

function AccountRow({ acc, accounts, onToggleVisibility, onSetGroup, onRemove, deleting }) {
  return (
    <div className="bg-card-bg rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 border border-warm-200 dark:border-disc-border">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${PLATFORM_COLOR[acc.platform] || 'bg-gray-500 text-white'}`}>
          {PLATFORM_LABEL[acc.platform] || acc.platform}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-disc-text truncate">{acc.name}</p>
          <p className="text-xs text-gray-400 dark:text-disc-muted font-mono truncate">{acc.social_id}</p>
          {acc.platform === 'ig' && <TokenExpiry expiresAt={acc.user_token_expires_at} />}
          {acc.platform === 'ig' && !acc.has_user_token && (
            <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
              <AlertTriangle size={12} /> ไม่มี User Token — กด Connect ใหม่
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <select
          value={acc.group_name || ''}
          onChange={async e => {
            if (e.target.value === '__new__') {
              const name = prompt('ชื่อกลุ่มใหม่:')?.trim()
              if (name) await onSetGroup(acc, name)
            } else {
              await onSetGroup(acc, e.target.value || null)
            }
          }}
          title="กลุ่มโพสต์"
          className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-disc-hover text-gray-700 dark:text-disc-text border border-warm-200 dark:border-disc-border focus:outline-none focus:ring-2 focus:ring-orange/40"
        >
          <option value="">(ไม่มีกลุ่ม)</option>
          {[...new Set(accounts.map(a => a.group_name).filter(Boolean))].map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
          <option value="__new__">+ สร้างกลุ่มใหม่</option>
        </select>

        {onToggleVisibility && (
          <button
            onClick={() => onToggleVisibility(acc)}
            title={acc.visibility === 'public' ? 'สาธารณะ' : 'ส่วนตัว'}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition ${
              acc.visibility === 'public'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                : 'bg-gray-100 text-gray-500 dark:bg-disc-hover dark:text-disc-muted hover:bg-gray-200 dark:hover:bg-disc-border'
            }`}
          >
            {acc.visibility === 'public' ? <Globe size={12} /> : <Lock size={12} />}
            {acc.visibility === 'public' ? 'สาธารณะ' : 'ส่วนตัว'}
          </button>
        )}

        <button
          onClick={() => onRemove(acc.id)}
          disabled={deleting === acc.id}
          className="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

export default function SocialAccountsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [accounts, setAccounts] = useState([])
  const [cfg, setCfg]           = useState(null)   // { guildId, guildName, meta_app_id, ... }
  const [editConfig, setEditConfig] = useState(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [banner, setBanner]     = useState(null)

  const { access, superAdmin } = useEffectiveRoles(session)  // effective — สะท้อน view-as-role
  const canManage  = canManageSocialGuild(access)

  const load = useCallback(async () => {
    const [accRes, cfgRes] = await Promise.all([
      fetch('/api/social/accounts'),
      fetch('/api/social/guild-configs'),
    ])
    if (accRes.ok) setAccounts(await accRes.json())
    if (cfgRes.ok) setCfg(await cfgRes.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated') load()
  }, [status, load, router])

  useEffect(() => {
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [load])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const account   = searchParams.get('account')
    const error     = searchParams.get('error')
    if (connected) setBanner({ type: 'success', msg: `เชื่อมต่อ @${account} สำเร็จแล้ว` })
    if (error === 'denied') setBanner({ type: 'error', msg: 'ยกเลิก OAuth' })
    if (error && error !== 'denied') setBanner({ type: 'error', msg: `เชื่อมต่อไม่สำเร็จ (${error})` })
  }, [searchParams])

  useEffect(() => {
    if (!editConfig) return
    const h = e => { if (e.key === 'Escape') setEditConfig(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [editConfig])

  async function saveConfig() {
    if (!editConfig) return
    setSavingConfig(true)
    const res = await fetch('/api/social/guild-configs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild_id: cfg.guildId, key: editConfig.key, value: editConfig.value }),
    })
    if (res.ok) {
      setCfg(prev => ({ ...prev, [editConfig.key]: editConfig.value || undefined }))
      setEditConfig(null)
    }
    setSavingConfig(false)
  }

  async function setGroup(acc, newGroup) {
    await fetch(`/api/social/accounts/${acc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_name: newGroup }),
    })
    setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, group_name: newGroup || null } : a))
  }

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

  if (status === 'loading' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  const discordId    = session?.user?.discordId
  const guildId      = cfg?.guildId
  const guildName    = cfg?.guildName ?? guildId
  // รองรับทั้ง manager response (field จริง) และ member response (boolean flag)
  const hasMeta      = !!(cfg?.meta_app_id && cfg?.meta_app_secret) || !!cfg?.hasMeta
  const hasX         = !!(cfg?.x_consumer_key && cfg?.x_consumer_secret) || !!cfg?.hasX
  const guildAccounts = accounts.filter(a => a.visibility === 'public')
  const myAccounts    = accounts.filter(a => a.visibility === 'private' && a.user_discord_id === discordId)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">แพลตฟอร์ม</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">บัญชี Facebook / Instagram / Threads / X ที่เชื่อมต่อกับ bot</p>
      </div>

      {banner && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
          {banner.msg}
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* Guild section — manager/superadmin only */}
        {(canManage || superAdmin) && guildId && (
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide">
                {guildName}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {hasX ? (
                  <a
                    href={`/api/x/oauth/start?guild_id=${guildId}&visibility=private`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-sm hover:opacity-80 transition"
                  >
                    <Globe size={14} /> Connect X
                  </a>
                ) : (
                  <button disabled title="ตั้งค่า X Consumer Key/Secret ก่อน" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-sm opacity-30 cursor-not-allowed">
                    <Globe size={14} /> Connect X
                  </button>
                )}
                {hasMeta ? (
                  <a
                    href={`/api/meta/oauth/start?guild_id=${guildId}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm hover:opacity-90 transition"
                  >
                    <RefreshCw size={14} /> Connect Meta OAuth
                  </a>
                ) : (
                  <button disabled title="ตั้งค่า Meta App ID/Secret ก่อน" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm opacity-30 cursor-not-allowed">
                    <RefreshCw size={14} /> Connect Meta OAuth
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
                  const val = cfg?.[key]
                  const display = !val ? '—' : secret ? '••••••••' : (val.length > 24 ? val.slice(0, 12) + '…' + val.slice(-6) : val)
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="text-xs text-gray-500 dark:text-disc-muted w-36 shrink-0">{label}</span>
                      <span className={`flex-1 font-mono text-xs ${val ? 'text-gray-700 dark:text-disc-text' : 'text-gray-400 dark:text-disc-muted'}`}>{display}</span>
                      <button
                        onClick={() => setEditConfig({ key, value: val || '' })}
                        className="text-xs text-orange hover:underline shrink-0"
                      >
                        {val ? 'แก้ไข' : 'ตั้งค่า'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {guildAccounts.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-disc-muted pl-1">ยังไม่มีบัญชี</p>
            ) : (
              <div className="flex flex-col gap-2">
                {guildAccounts.map(acc => (
                  <AccountRow key={acc.id} acc={acc} accounts={accounts}
                    onToggleVisibility={toggleVisibility} onSetGroup={setGroup}
                    onRemove={remove} deleting={deleting} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Personal section */}
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide">
              Personal
            </h2>
            {guildId && (
              <div className="flex items-center gap-2 flex-wrap">
                {hasX ? (
                  <a
                    href={`/api/x/oauth/start?guild_id=${guildId}&visibility=private`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-sm hover:opacity-80 transition"
                  >
                    <Globe size={14} /> Connect X
                  </a>
                ) : (
                  <button disabled title="ยังไม่มี X App Credentials — ติดต่อ admin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white text-sm opacity-30 cursor-not-allowed">
                    <Globe size={14} /> Connect X
                  </button>
                )}
                {hasMeta ? (
                  <a
                    href={`/api/meta/oauth/start?guild_id=${guildId}&visibility=private`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm hover:opacity-90 transition"
                  >
                    <RefreshCw size={14} /> Connect Meta
                  </a>
                ) : (
                  <button disabled title="ยังไม่มี Meta App Credentials — ติดต่อ admin" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange text-white text-sm opacity-30 cursor-not-allowed">
                    <RefreshCw size={14} /> Connect Meta
                  </button>
                )}
              </div>
            )}
          </div>
          {myAccounts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-disc-muted pl-1">ยังไม่มีบัญชีส่วนตัว</p>
          ) : (
            <div className="flex flex-col gap-2">
              {myAccounts.map(acc => (
                <AccountRow key={acc.id} acc={acc} accounts={accounts}
                  onToggleVisibility={canManage || superAdmin ? toggleVisibility : null}
                  onSetGroup={setGroup}
                  onRemove={remove} deleting={deleting} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit config modal */}
      {editConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditConfig(null)}>
          <div className="bg-white dark:bg-disc-bg2 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-disc-text">
                {{ meta_app_id: 'Meta App ID', meta_app_secret: 'Meta App Secret', x_consumer_key: 'X Consumer Key', x_consumer_secret: 'X Consumer Secret' }[editConfig.key]}
              </h2>
              <button onClick={() => setEditConfig(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-disc-text"><X size={18} /></button>
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
                <button type="button" onClick={() => setEditConfig(null)} className="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover transition">ยกเลิก</button>
                <button type="submit" disabled={savingConfig} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
                  <Check size={14} />{savingConfig ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
