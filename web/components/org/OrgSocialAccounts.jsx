'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trash2, RefreshCw, Globe, Lock, AlertTriangle, X, Settings, Check, Megaphone, AtSign } from 'lucide-react'
import { canManageSocialGuild } from '@/lib/roles.js'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { useTranslations } from 'next-intl'
import NewsChannelModal from './NewsChannelModal.jsx'

const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: '@ (Threads)', x: 'X (Twitter)' }
const PLATFORM_COLOR = {
  fb:      'bg-blue-600 text-white',
  ig:      'bg-gradient-to-r from-purple-500 to-orange-400 text-white',
  threads: 'bg-gray-800 text-white dark:bg-gray-700',
  x:       'bg-black text-white',
}

function TokenExpiry({ expiresAt, t }) {
  if (!expiresAt) return null
  const msLeft = new Date(expiresAt).getTime() - Date.now()
  const days = Math.floor(msLeft / 86400000)
  if (days < 0) return (
    <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 font-medium">
      <AlertTriangle size={12} /> {t('social.token.expired')}
    </span>
  )
  if (days <= 7) return (
    <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
      <AlertTriangle size={12} /> {t('social.token.expiringIn', { days })}
    </span>
  )
  return <span className="text-xs text-green-600 dark:text-green-400">{t('social.token.daysLeft', { days })}</span>
}

// ปุ่ม + Discord News — วางแถวเดียวกับปุ่ม Connect เพราะห้องข่าวสารก็เป็นปลายทางของกลุ่มเหมือนกัน
// ไม่มีสิทธิ์ตั้ง = เทา + tooltip บอกเหตุ (แบบเดียวกับปุ่ม Connect ตอนยังไม่มี app creds)
function NewsButton({ enabled, hasGroups, onClick, t }) {
  const reason = !hasGroups ? t('social.news.needGroup') : !enabled ? t('social.news.needMediaTeam') : null
  if (reason) {
    return (
      <button disabled title={reason} aria-label={reason} className="flex items-center justify-center p-2 rounded-lg bg-indigo-600 text-white text-sm opacity-30 cursor-not-allowed">
        <Megaphone size={16} />
      </button>
    )
  }
  return (
    <button onClick={onClick} title={t('social.news.title')} aria-label={t('social.news.title')} className="flex items-center justify-center p-2 rounded-lg bg-indigo-600 text-white text-sm hover:opacity-90 transition">
      <Megaphone size={16} />
    </button>
  )
}

// แถว "ห้องข่าวสาร Discord" — แสดงเหมือนแถวบัญชีโซเชียล เพราะมันคือปลายทางอีกอันของกลุ่ม
// 1 กลุ่ม = 1 แถว · เพิ่มได้เรื่อยๆ ตามจำนวนกลุ่ม (พฤติกรรมเดียวกับการเชื่อมบัญชี)
// ไม่โชว์กลุ่มที่ใช้ค่า default ของเซิร์ฟ (newsSource === 'guild') — นั่นไม่ใช่แถวที่ใครสร้าง
function NewsRow({ g, groupOptions, onMove, onRemove, canSetNews, busy, t }) {
  const off = g.newsChannelId === 'off'
  return (
    <div className="bg-card-bg rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 border border-warm-200 dark:border-disc-border">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white">
          {t('social.news.badge')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-disc-text truncate">
            {off ? t('social.news.off') : g.newsChannelName ? `#${g.newsChannelName}` : t('social.news.unknownChannel')}
          </p>
          <p className="text-xs text-gray-400 dark:text-disc-muted truncate">{g.guildName || g.guildId || ''}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <select
          value={g.name}
          disabled={!canSetNews || busy}
          onChange={e => onMove(g, e.target.value)}
          title={t('social.group.title')}
          className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-disc-hover text-gray-700 dark:text-disc-text border border-warm-200 dark:border-disc-border focus:outline-none focus:ring-2 focus:ring-orange/40 disabled:opacity-50"
        >
          {groupOptions.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <button
          onClick={() => onRemove(g)}
          disabled={!canSetNews || busy}
          className="p-1.5 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-40"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function AccountRow({ acc, accounts, onToggleVisibility, onSetGroup, onRemove, deleting, t }) {
  return (
    <div className="bg-card-bg rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 border border-warm-200 dark:border-disc-border">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-md ${PLATFORM_COLOR[acc.platform] || 'bg-gray-500 text-white'}`}>
          {PLATFORM_LABEL[acc.platform] || acc.platform}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-disc-text truncate">{acc.name}</p>
          <p className="text-xs text-gray-400 dark:text-disc-muted font-mono truncate">{acc.social_id}</p>
          {/* threads เก็บ token ที่ access_token (ไม่ใช่ user_token) แต่ใช้ user_token_expires_at
              เป็นที่จดวันหมดอายุร่วมกัน — เดิมช่องนี้โชว์แค่ ig เลยไม่มีใครเห็นว่า Threads ตาย (2026-08-08) */}
          {['ig', 'threads'].includes(acc.platform) && <TokenExpiry expiresAt={acc.user_token_expires_at} t={t} />}
          {acc.platform === 'threads' && !acc.user_token_expires_at && (
            <span className="flex items-center gap-1 text-xs text-orange-500">
              <AlertTriangle size={12} /> {t('social.token.threadsUnknown')}
            </span>
          )}
          {acc.platform === 'ig' && !acc.has_user_token && (
            <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
              <AlertTriangle size={12} /> {t('social.token.igMissing')}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <select
          value={acc.group_name || ''}
          onChange={async e => {
            if (e.target.value === '__new__') {
              const name = prompt(t('social.group.prompt'))?.trim()
              if (name) await onSetGroup(acc, name)
            } else {
              await onSetGroup(acc, e.target.value || null)
            }
          }}
          title={t('social.group.title')}
          className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-disc-hover text-gray-700 dark:text-disc-text border border-warm-200 dark:border-disc-border focus:outline-none focus:ring-2 focus:ring-orange/40"
        >
          <option value="">{t('social.group.none')}</option>
          {[...new Set(accounts.map(a => a.group_name).filter(Boolean))].map(g => (
            <option key={g} value={g}>{g}</option>
          ))}
          <option value="__new__">{t('social.group.create')}</option>
        </select>

        {onToggleVisibility && (
          <button
            onClick={() => onToggleVisibility(acc)}
            title={acc.visibility === 'public' ? t('social.visibility.public') : t('social.visibility.private')}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition ${
              acc.visibility === 'public'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                : 'bg-gray-100 text-gray-500 dark:bg-disc-hover dark:text-disc-muted hover:bg-gray-200 dark:hover:bg-disc-border'
            }`}
          >
            {acc.visibility === 'public' ? <Globe size={12} /> : <Lock size={12} />}
            {acc.visibility === 'public' ? t('social.visibility.public') : t('social.visibility.private')}
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

// บัญชีโซเชียลขององค์กร — ย้ายมาจาก /bot/platforms (2026-08-09)
// เดิมอยู่ใต้ /bot เพราะ creds เคยผูก Discord guild · ตอนนี้ทั้ง creds (org_config) และ
// ตัวบัญชี (dc_social_accounts.org_id) เป็นของ org แล้ว → ไม่ต้องมี guild ก็ใช้ได้ครบ
// ⚠️ ห้องข่าวสาร/ห้องแจ้งเตือน (Discord artifact ราย guild) ไม่ได้ย้ายมาด้วย — อยู่ที่ /bot
export default function OrgSocialAccounts() {
  const t  = useTranslations('org')
  const tc = useTranslations('common')   // คีย์ common อยู่ top-level ไม่ใช่ใต้ org (bug เดิม: org.common.* ว่าง)
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
  // ห้องข่าวสาร Discord ผูกรายกลุ่ม (2026-08-12) — ปลายทางอีกอันของกลุ่ม เคียงกับ FB/IG/X
  const [groups, setGroups]     = useState([])
  const [canSetNews, setCanSetNews] = useState(false)
  const [newsModal, setNewsModal]   = useState(null)   // 'public' | 'private' = โซนที่กดมา
  const [newsBusy, setNewsBusy]     = useState(false)

  const { access, superAdmin } = useEffectiveRoles(session)  // effective — สะท้อน view-as-role
  const canManage  = canManageSocialGuild(access)

  const load = useCallback(async () => {
    const [accRes, cfgRes, grpRes] = await Promise.all([
      fetch('/api/social/accounts'),
      fetch('/api/social/guild-configs'),
      fetch('/api/social/groups'),
    ])
    if (accRes.ok) setAccounts(await accRes.json())
    if (cfgRes.ok) setCfg(await cfgRes.json())
    if (grpRes.ok) {
      const data = await grpRes.json()
      setGroups(Array.isArray(data.groups) ? data.groups : [])
      setCanSetNews(!!data.canSetNews)
    }
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
    if (connected) setBanner({ type: 'success', msg: t('social.banner.connected', { account }) })
    if (error === 'denied') setBanner({ type: 'error', msg: t('social.banner.denied') })
    if (error && error !== 'denied') setBanner({ type: 'error', msg: t('social.banner.failed', { code: error }) })
  }, [searchParams, t])

  useEffect(() => {
    if (!editConfig) return
    const h = e => { if (e.key === 'Escape') setEditConfig(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [editConfig])


  async function saveConfig() {
    if (!editConfig) return
    setSavingConfig(true)
    // หน้านี้แก้เฉพาะ app creds ที่เป็นของ org → ไม่ส่ง guild_id (ส่งไปจะโดนด่าน manager ราย guild
    // ซึ่ง user ที่ไม่มี Discord ผ่านไม่ได้) · คีย์ราย guild ย้ายไปอยู่หน้า /bot แล้ว
    const res = await fetch('/api/social/guild-configs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: editConfig.key, value: editConfig.value }),
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

  async function patchNews(group, channel) {
    return fetch('/api/social/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, news_channel_id: channel }),
    })
  }

  // ถอดแถวห้องข่าวสาร → กลุ่ม public ตกกลับไปใช้ห้องของเซิร์ฟ · private = ส่งไม่ได้
  async function clearNews(g) {
    setNewsBusy(true)
    await patchNews(g.name, null)
    await load()
    setNewsBusy(false)
  }

  // ย้ายแถวไปกลุ่มอื่น = ถอดของกลุ่มเดิมแล้วตั้งให้กลุ่มใหม่ (ห้องเดียวกัน)
  // กลุ่มใหม่ต้องอยู่เซิร์ฟเดียวกับห้อง ไม่งั้น API ตอบ 400 — ปล่อยให้ error ขึ้นตามจริง
  async function moveNews(g, toGroup) {
    if (!toGroup || toGroup === g.name) return
    setNewsBusy(true)
    const res = await patchNews(toGroup, g.newsChannelId)
    if (res.ok) await patchNews(g.name, null)
    else {
      const data = await res.json().catch(() => ({}))
      setBanner({ type: 'error', msg: data.error || t('social.news.saveFailed') })
    }
    await load()
    setNewsBusy(false)
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
    if (!confirm(t('social.confirmDelete'))) return
    setDeleting(id)
    await fetch(`/api/social/accounts/${id}`, { method: 'DELETE' })
    setAccounts(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  if (status === 'loading' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">{t('social.loading')}</p>
  }

  const discordId    = session?.user?.discordId
  const userId       = session?.user?.userId
  // รองรับทั้ง manager response (field จริง) และ member response (boolean flag)
  const hasMeta      = !!(cfg?.meta_app_id && cfg?.meta_app_secret) || !!cfg?.hasMeta
  const hasX         = !!(cfg?.x_consumer_key && cfg?.x_consumer_secret) || !!cfg?.hasX
  // Threads มี creds ของตัวเอง — ไม่ยืมของ Meta (getThreadsApp ไม่ fallback แล้ว)
  const hasThreads   = !!(cfg?.threads_app_id && cfg?.threads_app_secret) || !!cfg?.hasThreads
  // แถวห้องข่าวสาร = กลุ่มที่ตั้งห้องเอง (channel id หรือ 'off') · ค่าที่ตกมาจากเซิร์ฟไม่นับเป็นแถว
  const newsRows = list => list.filter(g => g.newsSource === 'group' || g.newsChannelId === 'off')

  // กลุ่มแยกตามโซน — ปุ่ม/ป้ายในโซนไหนก็เห็นแต่กลุ่มของโซนนั้น
  const orgGroups      = groups.filter(g => g.visibility === 'public')
  const personalGroups = groups.filter(g => g.visibility === 'private')
  const guildAccounts = accounts.filter(a => a.visibility === 'public')
  // เจ้าของ = owner_user_id (user อีเมลก็มี) · fallback discord id สำหรับแถวเก่าที่ยังไม่มี owner
  const myAccounts    = accounts.filter(a => a.visibility === 'private' &&
    (a.owner_user_id != null ? a.owner_user_id === userId : a.user_discord_id === discordId))

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-gray-500 dark:text-disc-muted">
          {t('social.subtitle')}
        </p>
      </div>

      {banner && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between ${banner.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
          {banner.msg}
          <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {/* บัญชีขององค์กร — manager/superadmin only · ไม่ผูก guild แล้ว org ที่ไม่มี Discord ก็เห็น */}
        {(canManage || superAdmin) && (
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
              {/* บัญชี public + App Credentials เป็นของ "องค์กร" ทั้งคู่ (ทุก guild ในองค์กรใช้ชุดเดียวกัน) 2026-07-29 */}
              <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide">
                {t('social.orgHeading')}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {hasX ? (
                  <a
                    href={`/api/x/oauth/start?visibility=private`}
                    title={t('social.connect.titleX')} aria-label={t('social.connect.titleX')}
                    className="flex items-center justify-center p-2 rounded-lg bg-black text-white text-sm hover:opacity-80 transition"
                  >
                    <Globe size={16} />
                  </a>
                ) : (
                  <button disabled title={t('social.connect.needX')} aria-label={t('social.connect.needX')} className="flex items-center justify-center p-2 rounded-lg bg-black text-white text-sm opacity-30 cursor-not-allowed">
                    <Globe size={16} />
                  </button>
                )}
                {hasMeta ? (
                  <a
                    href={`/api/meta/oauth/start`}
                    title={t('social.connect.metaTitle')} aria-label={t('social.connect.metaTitle')}
                    className="flex items-center justify-center p-2 rounded-lg bg-orange text-white text-sm hover:opacity-90 transition"
                  >
                    <RefreshCw size={16} />
                  </a>
                ) : (
                  <button disabled title={t('social.connect.needMeta')} aria-label={t('social.connect.needMeta')} className="flex items-center justify-center p-2 rounded-lg bg-orange text-white text-sm opacity-30 cursor-not-allowed">
                    <RefreshCw size={16} />
                  </button>
                )}
                {/* Threads แยกปุ่ม: authorize ที่ threads.net + creds คนละชุด → รวมกับปุ่ม Meta ไม่ได้ */}
                {hasThreads ? (
                  <a
                    href={`/api/threads/oauth/start`}
                    title={t('social.connect.titleThreads')} aria-label={t('social.connect.titleThreads')}
                    className="flex items-center justify-center p-2 rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-sm hover:opacity-90 transition"
                  >
                    <AtSign size={16} />
                  </a>
                ) : (
                  <button disabled title={t('social.connect.needThreads')} aria-label={t('social.connect.needThreads')} className="flex items-center justify-center p-2 rounded-lg bg-gray-800 dark:bg-gray-700 text-white text-sm opacity-30 cursor-not-allowed">
                    <AtSign size={16} />
                  </button>
                )}
                <NewsButton
                  enabled={canSetNews}
                  hasGroups={orgGroups.length > 0}
                  onClick={() => setNewsModal('public')}
                  t={t}
                />
              </div>
            </div>

            {/* App Credentials */}
            <div className="bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <Settings size={14} className="text-gray-500 dark:text-disc-muted" />
                <span className="text-xs font-semibold text-gray-700 dark:text-disc-text uppercase tracking-wide">{t('social.creds.heading')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {[
                  { key: 'meta_app_id',       label: 'Meta App ID',       secret: false },
                  { key: 'meta_app_secret',   label: 'Meta App Secret',   secret: true  },
                  // Threads ใช้ App ID/Secret คนละชุดกับ Facebook (Dashboard → use case "Threads API")
                  { key: 'threads_app_id',    label: 'Threads App ID',    secret: false },
                  { key: 'threads_app_secret', label: 'Threads App Secret', secret: true },
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
                        {val ? t('social.creds.edit') : t('social.creds.set')}
                      </button>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-400 dark:text-disc-muted mt-3">
                {t('social.creds.note')}
              </p>
            </div>

            {guildAccounts.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-disc-muted pl-1">{t('social.emptyOrg')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {guildAccounts.map(acc => (
                  <AccountRow key={acc.id} acc={acc} accounts={accounts}
                    onToggleVisibility={toggleVisibility} onSetGroup={setGroup}
                    onRemove={remove} deleting={deleting} t={t}
                    />
                ))}
                {newsRows(orgGroups).map(g => (
                  <NewsRow key={g.name} g={g} groupOptions={orgGroups.map(x => x.name)}
                    onMove={moveNews} onRemove={clearNews} canSetNews={canSetNews}
                    busy={newsBusy} t={t} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Personal section */}
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide">
              {t('social.personalHeading')}
            </h2>
            {(
              <div className="flex items-center gap-2 flex-wrap">
                {hasX ? (
                  <a
                    href={`/api/x/oauth/start?visibility=private`}
                    title={t('social.connect.titleX')} aria-label={t('social.connect.titleX')}
                    className="flex items-center justify-center p-2 rounded-lg bg-black text-white text-sm hover:opacity-80 transition"
                  >
                    <Globe size={16} />
                  </a>
                ) : (
                  <button disabled title={t('social.connect.noXAdmin')} aria-label={t('social.connect.noXAdmin')} className="flex items-center justify-center p-2 rounded-lg bg-black text-white text-sm opacity-30 cursor-not-allowed">
                    <Globe size={16} />
                  </button>
                )}
                {hasMeta ? (
                  <a
                    href={`/api/meta/oauth/start?visibility=private`}
                    title={t('social.connect.titleMeta')} aria-label={t('social.connect.titleMeta')}
                    className="flex items-center justify-center p-2 rounded-lg bg-orange text-white text-sm hover:opacity-90 transition"
                  >
                    <RefreshCw size={16} />
                  </a>
                ) : (
                  <button disabled title={t('social.connect.noMetaAdmin')} aria-label={t('social.connect.noMetaAdmin')} className="flex items-center justify-center p-2 rounded-lg bg-orange text-white text-sm opacity-30 cursor-not-allowed">
                    <RefreshCw size={16} />
                  </button>
                )}
                <NewsButton
                  enabled={canSetNews}
                  hasGroups={personalGroups.length > 0}
                  onClick={() => setNewsModal('private')}
                  t={t}
                />
              </div>
            )}
          </div>
          {myAccounts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-disc-muted pl-1">{t('social.emptyPersonal')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {myAccounts.map(acc => (
                <AccountRow key={acc.id} acc={acc} accounts={accounts}
                  onToggleVisibility={canManage || superAdmin ? toggleVisibility : null}
                  onSetGroup={setGroup}
                  onRemove={remove} deleting={deleting} t={t} />
              ))}
              {newsRows(personalGroups).map(g => (
                <NewsRow key={g.name} g={g} groupOptions={personalGroups.map(x => x.name)}
                  onMove={moveNews} onRemove={clearNews} canSetNews={canSetNews}
                  busy={newsBusy} t={t} />
              ))}
            </div>
          )}
        </div>
      </div>

      {newsModal && (
        <NewsChannelModal
          groups={newsModal === 'public' ? orgGroups : personalGroups}
          onClose={() => setNewsModal(null)}
          onSaved={load}
        />
      )}

      {/* Edit config modal */}
      {editConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setEditConfig(null)}>
          <div className="bg-white dark:bg-disc-bg2 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900 dark:text-disc-text">
                {{ meta_app_id: 'Meta App ID', meta_app_secret: 'Meta App Secret', threads_app_id: 'Threads App ID', threads_app_secret: 'Threads App Secret', x_consumer_key: 'X Consumer Key', x_consumer_secret: 'X Consumer Secret' }[editConfig.key]}
              </h2>
              <button onClick={() => setEditConfig(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-disc-text"><X size={18} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); saveConfig() }} className="flex flex-col gap-3">
              <input
                type={editConfig.key.endsWith('_secret') ? 'password' : 'text'}
                value={editConfig.value}
                onChange={e => setEditConfig(prev => ({ ...prev, value: e.target.value }))}
                placeholder={t('social.creds.placeholder')}
                autoFocus
                className="w-full px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange/40"
              />
              <p className="text-xs text-gray-400 dark:text-disc-muted">
                {editConfig.key.startsWith('threads_')
                  ? t('social.creds.hintThreads')
                  : editConfig.key.startsWith('meta_')
                    ? t('social.creds.hintMeta')
                    : t('social.creds.hintX')}
              </p>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setEditConfig(null)} className="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover transition">{tc('cancel')}</button>
                <button type="submit" disabled={savingConfig} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40">
                  <Check size={14} />{savingConfig ? tc('saving') : tc('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
