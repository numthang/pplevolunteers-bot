'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, Phone, Users, FileText } from 'lucide-react'

// ฟีเจอร์ที่ toggle ได้ + คำอธิบาย (finance + bot เปิดตลอด ไม่อยู่ที่นี่)
const FEATURE_META = {
  calling:  { label: 'Calling', icon: Phone, desc: 'ระบบโทรหาสมาชิก — แคมเปญ, มอบหมาย, บันทึกการโทร' },
  contacts: { label: 'Contacts', icon: Users, desc: 'ฐานข้อมูลผู้ติดต่อ (CRM)' },
  docs:     { label: 'Docs', icon: FileText, desc: 'ใบสำคัญรับเงิน + e-signature สำหรับเบิกจ่ายกิจกรรม' },
}

function FeatureRow({ feature, enabled, saving, onToggle }) {
  const meta = FEATURE_META[feature] || { label: feature, icon: Users, desc: '' }
  const Icon = meta.icon
  return (
    <div className="flex items-center gap-3 bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border px-4 py-3">
      <Icon size={20} className="shrink-0 text-orange" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-disc-text">{meta.label}</p>
        {meta.desc && <p className="text-xs text-gray-400 dark:text-disc-muted">{meta.desc}</p>}
      </div>
      <button
        onClick={() => onToggle(feature, !enabled)}
        disabled={saving}
        role="switch"
        aria-checked={enabled}
        className={`relative shrink-0 w-11 h-6 rounded-full transition disabled:opacity-50 ${
          enabled ? 'bg-orange' : 'bg-gray-300 dark:bg-disc-border'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

export default function FeaturesPage() {
  const { status } = useSession()
  const router = useRouter()

  const [data, setData]     = useState(null)   // { guildId, toggleable, enabled }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    function load() {
      setLoading(true)
      fetch('/api/bot/features')
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => { if (ok) setData(d); else setError(d.error || 'โหลดไม่สำเร็จ') })
        .catch(() => setError('โหลดไม่สำเร็จ'))
        .finally(() => setLoading(false))
    }
    load()
    window.addEventListener('guild-switched', load)
    return () => window.removeEventListener('guild-switched', load)
  }, [status, router])

  async function toggle(feature, on) {
    setSaving(feature); setError(null)
    const res = await fetch('/api/bot/features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, on }),
    })
    const d = await res.json().catch(() => ({}))
    setSaving(null)
    if (!res.ok) { setError(d.error || 'บันทึกไม่สำเร็จ'); return }
    setData(prev => ({ ...prev, enabled: d.enabled }))
    router.refresh() // ให้ Nav อัปเดตเมนูตาม feature ใหม่
  }

  if (status !== 'authenticated' || loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (error && !data) {
    return <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">ฟีเจอร์</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">
          เปิด/ปิดระบบที่ใช้ใน guild นี้ — Finance และ Bot เปิดตลอดทุก guild
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {data.toggleable.map(f => (
          <FeatureRow key={f} feature={f} enabled={data.enabled.includes(f)}
            saving={saving === f} onToggle={toggle} />
        ))}
      </div>

      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3">{error}</p>}
      {saving && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-disc-muted mt-3">
          <Loader2 size={12} className="animate-spin" /> กำลังบันทึก...
        </p>
      )}
    </div>
  )
}
