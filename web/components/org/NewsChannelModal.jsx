'use client'
import { useEffect, useMemo, useState } from 'react'
import { Check, Hash, Loader2, Megaphone, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

// ผูก "ห้องข่าวสาร Discord" ให้กลุ่มโซเชียล — เปิดจากปุ่ม + Discord News ที่หน้า /org/settings/social
//
// ห้องข่าวสารเป็นปลายทางอีกอันของกลุ่ม (เคียงกับ FB/IG/X) เลยวางเป็นปุ่มแถวเดียวกับ Connect
// ไม่ใช่การ์ด config แยก · ผูกห้องแล้วกลุ่มได้ guild_id ของเซิร์ฟนั้นไปด้วย (ตะกร้าดิสฯ ใช้ค่านี้หาบัญชี)
const NEWS_OFF = 'off'

// ห้องที่ "น่าจะเป็นห้องข่าว" ดันขึ้นบนสุด — เซิร์ฟใหญ่มี 70+ ห้อง ไถหาไม่ไหว
const HINTS = ['ข่าว', 'ประชาสัมพันธ์', 'ประกาศ', 'news', 'announce']
const looksLikeNews = name => HINTS.some(h => name.toLowerCase().includes(h))

export default function NewsChannelModal({ groups, onClose, onSaved }) {
  const t = useTranslations('org')

  const [group, setGroup]     = useState(groups.length === 1 ? groups[0].name : '')
  const [channels, setChannels] = useState(null)   // null = ยังไม่โหลด · { list, unavailable }
  const [filter, setFilter]   = useState('')
  const [value, setValue]     = useState('')       // channel id | 'off' | ''
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState(null)

  const current = groups.find(g => g.name === group) || null

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // เปลี่ยนกลุ่ม → โหลดห้องของเซิร์ฟนั้น + ตั้งค่าที่ผูกไว้เดิมเป็นค่าเริ่มต้น
  useEffect(() => {
    setError(null)
    setValue(current?.newsSource === 'group' ? (current.newsChannelId || '') : '')
    if (!current?.guildId) { setChannels(null); return }
    let alive = true
    setChannels(null)
    fetch(`/api/discord/guilds/${current.guildId}/channels`)
      .then(res => (res.ok ? res.json() : { channels: [], unavailable: true }))
      .then(data => {
        if (!alive) return
        setChannels({ list: Array.isArray(data.channels) ? data.channels : [], unavailable: !!data.unavailable })
      })
      .catch(() => alive && setChannels({ list: [], unavailable: true }))
    return () => { alive = false }
  }, [current?.guildId, current?.newsChannelId, current?.newsSource])

  const shown = useMemo(() => {
    const list = channels?.list || []
    const q = filter.trim().toLowerCase()
    const matched = q
      ? list.filter(c => c.name.toLowerCase().includes(q) || (c.parentName || '').toLowerCase().includes(q))
      : list
    // ไม่ได้พิมพ์กรอง → ห้องที่ชื่อเข้าเค้า "ห้องข่าว" ขึ้นก่อน แล้วค่อยที่เหลือ
    return q ? matched : [...matched].sort((a, b) => Number(looksLikeNews(b.name)) - Number(looksLikeNews(a.name)))
  }, [channels, filter])

  async function save() {
    if (!group) return
    setSaving(true); setError(null)
    const res = await fetch('/api/social/groups', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, news_channel_id: value || null }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || t('social.news.saveFailed'))
      return
    }
    await onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="bg-white dark:bg-disc-bg2 rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-disc-text">
            <Megaphone size={16} className="text-orange" /> {t('social.news.title')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-disc-text"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 dark:text-disc-muted mb-4">{t('social.news.subtitle')}</p>

        <div className="flex flex-col gap-3">
          {/* กลุ่ม */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-disc-muted">{t('social.news.group')}</span>
            <select
              value={group}
              onChange={e => setGroup(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text border border-warm-200 dark:border-disc-border focus:outline-none focus:ring-2 focus:ring-orange/40"
            >
              <option value="">{t('social.news.pickGroup')}</option>
              {groups.map(g => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          </label>

          {/* ห้อง */}
          {!current ? null : !current.guildId ? (
            <p className="text-xs text-orange-500 flex items-center gap-1">
              {t('social.news.noServer')}
            </p>
          ) : channels === null ? (
            <p className="text-xs text-gray-500 dark:text-disc-muted flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> {t('social.news.loadingChannels')}
            </p>
          ) : channels.unavailable ? (
            // ดึงชื่อห้องไม่ได้ (บอทไม่อยู่ในเซิร์ฟ / ไม่มีสิทธิ์อ่าน) → ให้กรอก ID ดิบแทน พร้อมบอกเหตุ
            <label className="flex flex-col gap-1">
              <span className="text-xs text-orange-500">{t('social.news.channelsUnavailable')}</span>
              <input
                type="text"
                value={value === NEWS_OFF ? '' : value}
                onChange={e => setValue(e.target.value.trim())}
                placeholder={t('social.news.channelIdPlaceholder')}
                className="text-sm px-3 py-2 rounded-lg bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text border border-warm-200 dark:border-disc-border font-mono focus:outline-none focus:ring-2 focus:ring-orange/40"
              />
            </label>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-disc-muted" />
                <input
                  type="text"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder={t('social.news.searchChannel')}
                  className="w-full text-sm pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text border border-warm-200 dark:border-disc-border placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange/40"
                />
              </div>

              <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5 rounded-lg border border-warm-200 dark:border-disc-border p-1">
                {/* ค่าว่าง 2 ความหมายตาม visibility — กลุ่มองค์กรตกไปใช้ห้องของเซิร์ฟ, กลุ่มส่วนตัว = ไม่ส่ง */}
                <Choice
                  checked={value === ''}
                  onSelect={() => setValue('')}
                  label={current.visibility === 'public' ? t('social.news.useServerDefault') : t('social.news.none')}
                  muted
                />
                <Choice checked={value === NEWS_OFF} onSelect={() => setValue(NEWS_OFF)} label={t('social.news.off')} muted />
                {shown.map(c => (
                  <Choice
                    key={c.id}
                    checked={value === c.id}
                    onSelect={() => setValue(c.id)}
                    label={`#${c.name}`}
                    hint={c.parentName || null}
                    icon
                  />
                ))}
                {!shown.length && (
                  <p className="text-xs text-gray-400 dark:text-disc-muted px-2 py-1.5">{t('social.news.noMatch')}</p>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 mt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover transition">
              {t('common.cancel')}
            </button>
            <button
              onClick={save}
              disabled={!group || saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40"
            >
              <Check size={14} />{saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Choice({ checked, onSelect, label, hint, muted, icon }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md transition ${
        checked ? 'bg-orange/10 text-orange' : 'hover:bg-gray-100 dark:hover:bg-disc-hover text-gray-700 dark:text-disc-text'
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded-full border shrink-0 ${checked ? 'border-orange bg-orange' : 'border-warm-200 dark:border-disc-border'}`} />
      {icon && <Hash size={12} className="shrink-0 opacity-60" />}
      <span className={`truncate ${muted && !checked ? 'text-gray-500 dark:text-disc-muted' : ''}`}>{label}</span>
      {hint && <span className="text-xs text-gray-400 dark:text-disc-muted truncate ml-auto pl-2">{hint}</span>}
    </button>
  )
}
