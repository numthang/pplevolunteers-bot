'use client'
import { useCallback, useEffect, useState } from 'react'
import { Bot } from 'lucide-react'

// สวิตช์ ai_mention — ย้ายมาจากหน้า /bot/features ที่เหลือ toggle ตัวนี้ตัวเดียว (2026-08-09)
// finance/calling/docs/cases ย้ายไปเป็นสวิตช์ระดับ org ตั้งแต่ 2026-07-22 แล้ว เหลือตัวนี้
// ที่ยังราย guild จริง (บอทอ่านเองที่ index.js) → เก็บไว้ในหน้า AI แทนที่จะมีหน้าของตัวเอง
//
// ⚠️ /api/bot/features เป็น superadmin-only — ผู้เรียกต้อง gate ก่อน render ไม่งั้นเห็นหน้าแล้วพัง
export default function AiMentionToggle() {
  const [enabled, setEnabled] = useState(null)   // null = กำลังโหลด
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    fetch('/api/bot/features')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => setEnabled((d.enabled || []).includes('ai_mention')))
      .catch(() => setError(true))
  }, [])

  useEffect(() => {
    load()
    // สลับ guild แล้วค่าเปลี่ยน — หมวด /bot ทั้งหมวด scope ด้วย guild ที่เลือก
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [load])

  async function toggle() {
    const next = !enabled
    setEnabled(next); setSaving(true); setError(false)
    const res = await fetch('/api/bot/features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'ai_mention', on: next }),
    })
    setSaving(false)
    if (!res.ok) { setEnabled(!next); setError(true) }
  }

  if (error && enabled === null) return null

  return (
    <div className="flex items-center gap-3 bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border px-4 py-3">
      <Bot size={20} className="shrink-0 text-orange" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-disc-text">ตอบเมื่อถูก @mention</p>
        <p className="text-xs text-gray-400 dark:text-disc-muted">
          ดึงข้อมูล forum ของเซิร์ฟเวอร์นี้เป็น context แล้วให้ AI ตอบ
          {error && <span className="text-red-500 dark:text-red-400"> · บันทึกไม่สำเร็จ</span>}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving || enabled === null}
        role="switch"
        aria-checked={!!enabled}
        aria-label="ตอบเมื่อถูก @mention"
        className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${
          enabled ? 'bg-orange' : 'bg-gray-300 dark:bg-disc-border'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}
