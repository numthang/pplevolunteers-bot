'use client'
import { useEffect, useState } from 'react'
import { Check, Hash, Loader2, Megaphone, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

// ผูก "ห้องข่าวสาร Discord" ให้กลุ่มโซเชียล — เปิดจากปุ่ม + Discord News ที่หน้า /org/settings/social
//
// ห้องข่าวสารเป็นปลายทางอีกอันของกลุ่ม (เคียงกับ FB/IG/X) เลยเป็นปุ่มแถวเดียวกับ Connect ไม่ใช่การ์ด config
// ตัวเลือกห้อง = **เฉพาะห้องที่ตั้งไว้หน้า /bot** (1 ห้องต่อเซิร์ฟ) ไม่กางห้องทั้งเซิร์ฟ
// ผูกห้องแล้วกลุ่มสังกัดเซิร์ฟของห้องนั้นเอง (ตะกร้าดิสฯ ใช้ guild_id หาบัญชี)
const NEWS_OFF = 'off'

export default function NewsChannelModal({ groups, onClose, onSaved }) {
  const t  = useTranslations('org')
  const tc = useTranslations('common')   // คีย์ common อยู่ top-level ไม่ใช่ใต้ org

  const [group, setGroup]   = useState(groups.length === 1 ? groups[0].name : '')
  const [rooms, setRooms]   = useState(null)   // null = ยังโหลด · [] = ยังไม่มีใครตั้งห้องที่ /bot
  const [value, setValue]   = useState('')     // channel id | 'off' | ''
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const current = groups.find(g => g.name === group) || null

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    let alive = true
    fetch('/api/social/news-channels')
      .then(res => (res.ok ? res.json() : { rooms: [] }))
      .then(data => alive && setRooms(Array.isArray(data.rooms) ? data.rooms : []))
      .catch(() => alive && setRooms([]))
    return () => { alive = false }
  }, [])

  // เปลี่ยนกลุ่ม → ตั้งค่าที่ผูกไว้เดิมเป็นค่าเริ่มต้น (ค่าที่ตกมาจากเซิร์ฟไม่นับว่า "ผูกไว้")
  useEffect(() => {
    setError(null)
    setValue(current?.newsSource === 'group' ? (current.newsChannelId || '') : '')
  }, [current?.name, current?.newsChannelId, current?.newsSource])

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
                <option key={g.name} value={g.name}>{g.name}{g.visibility === 'private' ? ' 🔒' : ''}</option>
              ))}
            </select>
          </label>

          {/* ห้อง — ห้องที่ลงทะเบียนไว้ที่ /bot ของทุกเซิร์ฟในองค์กร (เลือกข้ามเซิร์ฟได้) */}
          {!current ? null : rooms === null ? (
            <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-disc-muted">
              <Loader2 size={12} className="animate-spin" /> {t('social.news.loadingChannels')}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-disc-muted">{t('social.news.channel')}</span>
              <div className="flex flex-col gap-0.5 rounded-lg border border-warm-200 dark:border-disc-border p-1">
                {/* ค่าว่าง 2 ความหมายตาม visibility — กลุ่มองค์กรตกไปใช้ห้องของเซิร์ฟ, กลุ่มส่วนตัว = ไม่ส่ง */}
                <Choice
                  checked={value === ''}
                  onSelect={() => setValue('')}
                  label={current.visibility === 'public' ? t('social.news.useServerDefault') : t('social.news.none')}
                  muted
                />
                <Choice checked={value === NEWS_OFF} onSelect={() => setValue(NEWS_OFF)} label={t('social.news.off')} muted />
                {rooms.map(r => (
                  <Choice
                    key={r.channelId}
                    checked={value === r.channelId}
                    onSelect={() => setValue(r.channelId)}
                    label={r.channelName ? `#${r.channelName}` : r.channelId}
                    hint={r.guildName}
                    icon
                  />
                ))}
              </div>
              {!rooms.length && (
                <p className="text-xs text-orange-500">{t('social.news.noRoomAnywhere')}</p>
              )}
              <a href="/bot#channels" className="text-xs text-orange hover:underline self-start">
                {t('social.news.openBotSettings')}
              </a>
            </div>
          )}

          {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 mt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg text-gray-500 dark:text-disc-muted hover:bg-gray-100 dark:hover:bg-disc-hover transition">
              {tc('cancel')}
            </button>
            <button
              onClick={save}
              disabled={!group || saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 transition disabled:opacity-40"
            >
              <Check size={14} />{saving ? tc('saving') : tc('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Choice({ checked, onSelect, label, hint, muted, icon, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={title}
      className={`flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md transition ${
        disabled ? 'opacity-40 cursor-not-allowed'
          : checked ? 'bg-orange/10 text-orange' : 'hover:bg-gray-100 dark:hover:bg-disc-hover text-gray-700 dark:text-disc-text'
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded-full border shrink-0 ${checked ? 'border-orange bg-orange' : 'border-warm-200 dark:border-disc-border'}`} />
      {icon && <Hash size={12} className="shrink-0 opacity-60" />}
      <span className={`truncate ${muted && !checked ? 'text-gray-500 dark:text-disc-muted' : ''}`}>{label}</span>
      {hint && <span className="text-xs text-gray-400 dark:text-disc-muted truncate ml-auto pl-2">{hint}</span>}
    </button>
  )
}
