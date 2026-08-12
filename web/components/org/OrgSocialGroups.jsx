'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Globe, Hash, Lock, Loader2, Server } from 'lucide-react'
import { useTranslations } from 'next-intl'

// ค่าระดับ "กลุ่ม" ของบัญชีโซเชียล — เซิร์ฟเวอร์ที่กลุ่มสังกัด + ห้องข่าวสารที่ยิงเข้า (2026-08-12)
//
// ทำไมต้องมีการ์ดนี้: ก่อนหน้านี้ทั้ง 2 ค่าตั้งจาก UI ไม่ได้เลย
//   guild_id        → ตะกร้าดิสฯ หาบัญชีด้วยค่านี้ ไม่มีค่า = "กดแชร์แล้วหากลุ่มไม่เจอ" แก้ได้แค่ SQL
//   news_channel_id → เดิมเก็บราย guild ที่ /bot → เลือกกลุ่มข้ามเซิร์ฟแล้วโพสต์ลงห้องผิดเซิร์ฟเงียบๆ
//
// เป็นฟอร์ม Update → autosave + ป้ายสถานะ + beforeunload ไม่มีปุ่มบันทึก (กฎ CLAUDE.md §บันทึก)
const PLATFORM_LABEL = { fb: 'Facebook', ig: 'Instagram', threads: '@ (Threads)', x: 'X (Twitter)' }
const NEWS_OFF = 'off'

export default function OrgSocialGroups({ guilds = [] }) {
  const t = useTranslations('org')

  const [groups, setGroups]   = useState([])
  const [perm, setPerm]       = useState({ canManage: false, canSetNews: false })
  const [channels, setChannels] = useState({})   // guildId → { list:[], unavailable:boolean }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)   // `${group}:${field}` ที่กำลังเซฟ
  const [saved, setSaved]     = useState(null)
  const [error, setError]     = useState(null)   // { group, msg }
  const loadedGuilds = useRef(new Set())

  const load = useCallback(async () => {
    const res = await fetch('/api/social/groups')
    if (res.ok) {
      const data = await res.json()
      setGroups(Array.isArray(data.groups) ? data.groups : [])
      setPerm({ canManage: !!data.canManage, canSetNews: !!data.canSetNews })
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // กันปิดแท็บตอนยังเซฟไม่เสร็จ (คู่บังคับของ autosave)
  useEffect(() => {
    if (!saving) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [saving])

  // โหลดลิสต์ห้องของเซิร์ฟที่กลุ่มใช้อยู่ (ตัวเลือกห้องข่าวสาร) — ต่อ guild ครั้งเดียว
  useEffect(() => {
    const ids = [...new Set(groups.map(g => g.guildId).filter(Boolean))]
    for (const gid of ids) {
      if (loadedGuilds.current.has(gid)) continue
      loadedGuilds.current.add(gid)
      fetch(`/api/discord/guilds/${gid}/channels`)
        .then(res => (res.ok ? res.json() : { channels: [], unavailable: true }))
        .then(data => setChannels(prev => ({
          ...prev,
          [gid]: { list: Array.isArray(data.channels) ? data.channels : [], unavailable: !!data.unavailable },
        })))
        .catch(() => setChannels(prev => ({ ...prev, [gid]: { list: [], unavailable: true } })))
    }
  }, [groups])

  async function save(group, field, value) {
    const key = `${group}:${field}`
    setSaving(key); setSaved(null); setError(null)

    const res = await fetch('/api/social/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, [field]: value }),
    })
    setSaving(null)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError({ group, msg: data.error || t('social.groups.saveFailed') })
      return
    }
    setSaved(key)
    setTimeout(() => setSaved(s => (s === key ? null : s)), 2000)
    await load()          // ค่าที่ derive จาก DB (newsSource/newsReady/ชื่อห้อง) ต้องมาจาก server เท่านั้น
  }

  if (loading) return <p className="text-warm-500 dark:text-disc-muted text-sm">{t('social.loading')}</p>
  if (!groups.length) return null

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-700 dark:text-disc-muted uppercase tracking-wide mb-1">
        {t('social.groups.heading')}
      </h2>
      <p className="text-sm text-gray-500 dark:text-disc-muted mb-3">{t('social.groups.subtitle')}</p>

      <div className="flex flex-col gap-2">
        {groups.map(g => {
          const ch = g.guildId ? channels[g.guildId] : null
          const newsKey = `${g.name}:news_channel_id`
          const guildKey = `${g.name}:guild_id`
          return (
            <div key={g.name} className="bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border p-4">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-disc-text">{g.name}</span>
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${
                  g.visibility === 'public'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-500 dark:bg-disc-hover dark:text-disc-muted'
                }`}>
                  {g.visibility === 'public' ? <Globe size={11} /> : <Lock size={11} />}
                  {t(`social.visibility.${g.visibility}`)}
                </span>
                {g.platforms.map(p => (
                  <span key={p} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-disc-hover text-gray-600 dark:text-disc-muted">
                    {PLATFORM_LABEL[p] || p}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* เซิร์ฟเวอร์ที่กลุ่มสังกัด — ตะกร้าดิสฯ ใช้ค่านี้หาบัญชี */}
                <label className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-disc-muted">
                    <Server size={12} /> {t('social.groups.server')}
                  </span>
                  <select
                    value={g.guildId || ''}
                    disabled={!perm.canManage || saving === guildKey}
                    onChange={e => save(g.name, 'guild_id', e.target.value || null)}
                    className="text-sm px-2 py-1.5 rounded-lg bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text border border-warm-200 dark:border-disc-border focus:outline-none focus:ring-2 focus:ring-orange/40 disabled:opacity-50"
                  >
                    <option value="">{t('social.groups.noServer')}</option>
                    {guilds.map(gu => (
                      <option key={gu.guild_id} value={gu.guild_id}>{gu.name}</option>
                    ))}
                  </select>
                </label>

                {/* ห้องข่าวสารของกลุ่มนี้ */}
                <label className="flex flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-disc-muted">
                    <Hash size={12} /> {t('social.groups.newsChannel')}
                  </span>
                  {ch?.unavailable ? (
                    // ดึงลิสต์ห้องจาก Discord ไม่ได้ (บอทไม่อยู่ในเซิร์ฟ/ไม่มีสิทธิ์) → ตกกลับไปกรอก ID ดิบ
                    <input
                      type="text"
                      defaultValue={g.newsChannelId === NEWS_OFF ? '' : (g.newsChannelId || '')}
                      disabled={!perm.canSetNews || !g.guildId}
                      onBlur={e => {
                        const v = e.target.value.trim()
                        if (v !== (g.newsChannelId || '')) save(g.name, 'news_channel_id', v || null)
                      }}
                      placeholder={t('social.groups.channelIdPlaceholder')}
                      className="text-sm px-2 py-1.5 rounded-lg bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text border border-warm-200 dark:border-disc-border font-mono focus:outline-none focus:ring-2 focus:ring-orange/40 disabled:opacity-50"
                    />
                  ) : (
                    <select
                      value={g.newsChannelId || ''}
                      disabled={!perm.canSetNews || !g.guildId || saving === newsKey}
                      onChange={e => save(g.name, 'news_channel_id', e.target.value || null)}
                      className="text-sm px-2 py-1.5 rounded-lg bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text border border-warm-200 dark:border-disc-border focus:outline-none focus:ring-2 focus:ring-orange/40 disabled:opacity-50"
                    >
                      {/* ค่าว่างมี 2 ความหมายตาม visibility — public ตกไปใช้ห้องของเซิร์ฟ, private = ไม่ส่ง */}
                      <option value="">
                        {g.visibility === 'public' ? t('social.groups.useServerDefault') : t('social.groups.notSet')}
                      </option>
                      <option value={NEWS_OFF}>{t('social.groups.off')}</option>
                      {(ch?.list || []).map(c => (
                        <option key={c.id} value={c.id}>
                          {c.parentName ? `${c.parentName} / #${c.name}` : `#${c.name}`}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              {/* สถานะ/คำเตือน */}
              <div className="flex items-center gap-3 flex-wrap mt-2 text-xs">
                {(saving === newsKey || saving === guildKey) && (
                  <span className="flex items-center gap-1 text-gray-500 dark:text-disc-muted">
                    <Loader2 size={12} className="animate-spin" /> {t('common.saving')}
                  </span>
                )}
                {(saved === newsKey || saved === guildKey) && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <Check size={12} /> {t('social.groups.saved')}
                  </span>
                )}
                {!g.guildId && (
                  <span className="flex items-center gap-1 text-orange-500">
                    <AlertTriangle size={12} /> {t('social.groups.noServerWarning')}
                  </span>
                )}
                {g.mixedGuilds && (
                  <span className="flex items-center gap-1 text-orange-500">
                    <AlertTriangle size={12} /> {t('social.groups.mixedGuildsWarning')}
                  </span>
                )}
                {g.newsSource === 'guild' && (
                  <span className="text-gray-400 dark:text-disc-muted">
                    {t('social.groups.usingServerNews', { channel: g.newsChannelName || '—' })}
                  </span>
                )}
                {g.newsSource === 'group' && g.newsChannelName && (
                  <span className="text-gray-400 dark:text-disc-muted">#{g.newsChannelName}</span>
                )}
                {error?.group === g.name && (
                  <span className="text-red-500 dark:text-red-400">{error.msg}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
