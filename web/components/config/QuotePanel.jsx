'use client'
import { useEffect, useState, useCallback } from 'react'
import { Check, Loader2, User, Server, Globe } from 'lucide-react'
import { QUOTE_TEMPLATE_CHOICES } from '@/lib/quoteStyles.js'

const SELECT_CLS =
  'h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border ' +
  'bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal w-full'

const KEY_WATERMARK = 'default_watermark'
const KEY_TEMPLATE  = 'quote_default_template'

// ── เซลล์เลือกค่า 1 ช่อง (template หรือ watermark) ของ scope หนึ่ง ──
function SettingSelect({ value, choices, onSave, placeholder }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  async function handleChange(e) {
    const v = e.target.value || null
    setSaving(true); setSaved(false)
    const ok = await onSave(v)
    setSaving(false)
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }

  return (
    <div className="relative flex items-center gap-2">
      <select value={value || ''} onChange={handleChange} disabled={saving} className={SELECT_CLS}>
        <option value="">{placeholder}</option>
        {choices.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      {saving && <Loader2 size={16} className="shrink-0 animate-spin text-teal" />}
      {saved  && <Check   size={16} className="shrink-0 text-green-500" />}
    </div>
  )
}

// ── 1 แถว scope (icon + ชื่อ + 2 ช่องเลือก) ──
function ScopeRow({ icon: Icon, label, sublabel, templateValue, watermarkValue, wmChoices, onSaveTemplate, onSaveWatermark }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr_1fr] gap-3 items-center py-3 border-t border-warm-200 dark:border-disc-border first:border-t-0">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={18} className="shrink-0 text-warm-400 dark:text-disc-muted" />
        <div className="min-w-0">
          <p className="text-base font-medium text-warm-900 dark:text-disc-text truncate">{label}</p>
          {sublabel && <p className="text-xs text-warm-500 dark:text-disc-muted truncate">{sublabel}</p>}
        </div>
      </div>
      <SettingSelect
        value={templateValue}
        choices={QUOTE_TEMPLATE_CHOICES}
        onSave={onSaveTemplate}
        placeholder="— ใช้ค่าระดับล่าง —"
      />
      <SettingSelect
        value={watermarkValue}
        choices={wmChoices}
        onSave={onSaveWatermark}
        placeholder={wmChoices.length ? '— ไม่ตั้ง —' : '(ไม่มีไฟล์ลายน้ำ)'}
      />
    </div>
  )
}

export default function QuotePanel() {
  const [data,    setData]    = useState(null)   // { personal, guilds, isSuperAdmin, global }
  const [wm,      setWm]      = useState({})      // scopeKey → choices[]
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const loadWatermarks = useCallback(async (scopeKey, scope, guildId) => {
    const qs = new URLSearchParams({ scope })
    if (guildId) qs.set('guild_id', guildId)
    const res = await fetch(`/api/bot/quote-watermarks?${qs}`)
    const choices = res.ok ? await res.json() : []
    setWm(prev => ({ ...prev, [scopeKey]: choices }))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/bot/quote-config')
    if (!res.ok) { setError('โหลดข้อมูลไม่สำเร็จ'); setLoading(false); return }
    const d = await res.json()
    setData(d)
    setLoading(false)

    // watermark choices ต่อ scope
    loadWatermarks('personal', 'personal')
    for (const g of d.guilds) loadWatermarks(`guild:${g.guild_id}`, 'guild', g.guild_id)
    if (d.isSuperAdmin) loadWatermarks('global', 'global')
  }, [loadWatermarks])

  useEffect(() => { load() }, [load])

  // save → PATCH → update local state ถ้าสำเร็จ
  const save = useCallback(async (scope, guildId, key, value) => {
    const res = await fetch('/api/bot/quote-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, guild_id: guildId, key, value }),
    })
    if (!res.ok) { setError('บันทึกไม่สำเร็จ'); return false }
    setData(prev => {
      const next = structuredClone(prev)
      if (scope === 'personal') next.personal = { ...next.personal, [key]: value }
      else if (scope === 'global') next.global = { ...next.global, [key]: value }
      else {
        const g = next.guilds.find(x => x.guild_id === guildId)
        if (g) g.config = { ...g.config, [key]: value }
      }
      return next
    })
    return true
  }, [])

  if (loading) {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }
  if (!data) return <p className="text-red-500 text-sm">{error || 'เกิดข้อผิดพลาด'}</p>

  const headerRow = (
    <div className="hidden sm:grid grid-cols-[200px_1fr_1fr] gap-3 pb-2 text-xs font-medium text-warm-500 dark:text-disc-muted uppercase">
      <span>ระดับ</span>
      <span>เทมเพลต Quote</span>
      <span>ลายน้ำเริ่มต้น</span>
    </div>
  )

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-gray-500 dark:text-disc-muted">
          ค่าที่ใช้เมื่อผู้ใช้ไม่ได้เลือกเองตอนสร้าง quote — ลำดับความสำคัญ:
          <span className="font-medium"> ของฉัน → Server → ทั้งระบบ</span>
        </p>
        <p className="text-xs text-gray-400 dark:text-disc-muted mt-1">
          💧 ลายน้ำเริ่มต้นเป็นค่ากลาง ใช้ร่วมกับระบบ Basket ด้วย
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-warm-200 dark:border-disc-border bg-card-bg p-4 sm:p-5">
        {headerRow}

        {/* Personal */}
        <ScopeRow
          icon={User}
          label="ของฉัน"
          sublabel="ใช้กับตัวคุณทุก server"
          templateValue={data.personal?.[KEY_TEMPLATE]}
          watermarkValue={data.personal?.[KEY_WATERMARK]}
          wmChoices={wm['personal'] || []}
          onSaveTemplate={v => save('personal', null, KEY_TEMPLATE, v)}
          onSaveWatermark={v => save('personal', null, KEY_WATERMARK, v)}
        />

        {/* Guilds (admin) */}
        {data.guilds.map(g => (
          <ScopeRow
            key={g.guild_id}
            icon={Server}
            label={g.name}
            sublabel="Server (admin)"
            templateValue={g.config?.[KEY_TEMPLATE]}
            watermarkValue={g.config?.[KEY_WATERMARK]}
            wmChoices={wm[`guild:${g.guild_id}`] || []}
            onSaveTemplate={v => save('guild', g.guild_id, KEY_TEMPLATE, v)}
            onSaveWatermark={v => save('guild', g.guild_id, KEY_WATERMARK, v)}
          />
        ))}

        {/* Global (superadmin) */}
        {data.isSuperAdmin && (
          <ScopeRow
            icon={Globe}
            label="ทั้งระบบ"
            sublabel="Superadmin — fallback ทุก guild"
            templateValue={data.global?.[KEY_TEMPLATE]}
            watermarkValue={data.global?.[KEY_WATERMARK]}
            wmChoices={wm['global'] || []}
            onSaveTemplate={v => save('global', null, KEY_TEMPLATE, v)}
            onSaveWatermark={v => save('global', null, KEY_WATERMARK, v)}
          />
        )}
      </div>

      {data.guilds.length === 0 && !data.isSuperAdmin && (
        <p className="text-xs text-warm-400 dark:text-disc-muted mt-3">
          * คุณตั้งได้เฉพาะ "ของฉัน" — ส่วน Server ต้องเป็น Admin ของ guild นั้น
        </p>
      )}
    </div>
  )
}
