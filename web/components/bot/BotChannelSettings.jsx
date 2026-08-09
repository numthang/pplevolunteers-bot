'use client'
import { useEffect, useRef, useState } from 'react'

// ห้อง Discord ที่บอทใช้ — ราย guild แท้ๆ (channel id เป็น artifact ของเซิร์ฟเวอร์นั้น)
// ย้ายมาจากการ์ด App Credentials ในหน้า /bot/platforms เดิม ที่เอา creds ของ org กับ
// ห้องของ guild มากองรวมกันในการ์ดเดียว (2026-08-09)
//
// เป็นฟอร์ม Update → autosave + ป้ายสถานะ ไม่มีปุ่มบันทึก (กฎ CLAUDE.md §บันทึก)
const FIELDS = [
  {
    key: 'news_channel_id',
    label: '📢 ห้องข่าวสาร',
    hint: 'คลิกขวาที่ห้องใน Discord → Copy Channel ID (ต้องเปิด Developer Mode) — ตั้งแล้วโพสต์จะแชร์ลงห้องนี้ได้',
  },
  {
    key: 'social_alert_channel_id',
    label: '🔑 ห้องแจ้งเตือน Token',
    hint: 'บอทจะเตือนที่นี่เมื่อ token โซเชียลใกล้หมดอายุหรือต่ออายุไม่สำเร็จ · ไม่ตั้ง = ใช้ห้องม็อดของ antispam แทน',
  },
]

export default function BotChannelSettings({ guildId, initial }) {
  const [values, setValues] = useState(() => ({
    news_channel_id: initial?.news_channel_id || '',
    social_alert_channel_id: initial?.social_alert_channel_id || '',
  }))
  const [saving, setSaving] = useState(null)   // key ที่กำลังเซฟ
  const [saved,  setSaved]  = useState(null)   // key ที่เพิ่งเซฟเสร็จ
  const [error,  setError]  = useState(null)
  const savedRef = useRef(initial || {})

  // กันปิดแท็บตอนยังเซฟไม่เสร็จ (คู่บังคับของ autosave)
  useEffect(() => {
    if (!saving) return
    const h = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [saving])

  async function commit(key) {
    const value = values[key].trim()
    if (value === (savedRef.current[key] || '')) return   // ไม่เปลี่ยน = ไม่ต้องยิง
    setSaving(key); setSaved(null); setError(null)

    const res = await fetch('/api/social/guild-configs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guild_id: guildId, key, value: value || null }),
    })

    setSaving(null)
    if (res.ok) {
      savedRef.current = { ...savedRef.current, [key]: value }
      setSaved(key)
      setTimeout(() => setSaved(s => (s === key ? null : s)), 2000)
    } else {
      setError(key)
    }
  }

  return (
    <div className="rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg p-4">
      <p className="text-sm font-semibold text-gray-900 dark:text-disc-text mb-3">ห้องที่บอทใช้</p>
      <div className="flex flex-col gap-4">
        {FIELDS.map(f => (
          <div key={f.key}>
            <div className="flex items-center gap-2 mb-1">
              <label htmlFor={f.key} className="text-xs font-medium text-gray-700 dark:text-disc-text">
                {f.label}
              </label>
              {saving === f.key && <span className="text-xs text-gray-400 dark:text-disc-muted">กำลังบันทึก…</span>}
              {saved  === f.key && <span className="text-xs text-green-600 dark:text-green-400">บันทึกแล้ว</span>}
              {error  === f.key && <span className="text-xs text-red-500 dark:text-red-400">บันทึกไม่สำเร็จ</span>}
            </div>
            <input
              id={f.key}
              value={values[f.key]}
              onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
              onBlur={() => commit(f.key)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              placeholder="ยังไม่ได้ตั้ง"
              inputMode="numeric"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange/40"
            />
            <p className="text-xs text-gray-400 dark:text-disc-muted mt-1">{f.hint}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
