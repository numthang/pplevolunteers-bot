'use client'
import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { normalizeHex } from '@/lib/hexColor.js'

// อัตลักษณ์ขององค์กร — ลายน้ำรายกลุ่มโซเชียล + สี CI + สไตล์การ์ดคำคม (owner only)
// ย้ายมาจาก /bot/media/watermark + /bot/media/quote (2026-08-10) ตอนที่ลายน้ำเลิกผูกกับ guild
//
// อัปโหลด/ลบ/ตั้ง default = ยิงทันที (เป็น "การกระทำ" ไม่ใช่ช่องกรอก)
// สี CI + สไตล์การ์ด = ช่องกรอก → มีปุ่มบันทึกตามกติกา Create vs Update ใน CLAUDE.md
export default function OrgBrand({ orgId }) {
  const t = useTranslations('org')
  const [data, setData] = useState(null)     // null=loading · false=ไม่มีสิทธิ์
  const [accent, setAccent] = useState('')
  const [accentInput, setAccentInput] = useState('')   // ข้อความในกล่องพิมพ์/วาง hex — sync กับ accent เมื่อค่าถูกต้อง
  const [template, setTemplate] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileInput = useRef(null)
  const uploadTo = useRef('')

  const base = `/api/org/orgs/${orgId}/brand`

  async function load() {
    const r = await fetch(base)
    if (!r.ok) { setData(false); return }
    const d = await r.json()
    setData(d)
    setAccent(d.quote?.quote_ci_accent || '')
    setAccentInput(d.quote?.quote_ci_accent || '')
    setTemplate(d.quote?.quote_default_template || '')
  }
  useEffect(() => { load() }, [orgId])   // eslint-disable-line react-hooks/exhaustive-deps

  if (data === null) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('brand.loading')}</p>
  if (data === false) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('brand.ownerOnly')}</p>

  async function act(fn, okMsg) {
    setBusy(true); setNote('')
    try {
      const r = await fn()
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setNote(d.error || t('brand.saveError')); return false }
      setNote(okMsg)
      await load()
      return true
    } finally { setBusy(false) }
  }

  // พิมพ์/วาง hex code เอง — commit ตอน blur/Enter เท่านั้น ไม่ใช่ทุกตัวอักษรที่พิมพ์
  function commitAccentText() {
    const hex = normalizeHex(accentInput)
    if (hex) { setAccent(hex); setAccentInput(hex) }
    else setAccentInput(accent)   // พิมพ์ไม่ครบ/ผิดรูปแบบ → คืนค่าที่ใช้อยู่จริง
  }

  function pickFile(group) {
    uploadTo.current = group
    fileInput.current?.click()
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const form = new FormData()
    form.append('group', uploadTo.current)
    form.append('file', file)
    await act(() => fetch(base, { method: 'POST', body: form }), t('brand.uploadSuccess'))
  }

  const removeFile = (group, file) => {
    if (!confirm(t('brand.deleteConfirm', { file }))) return
    act(() => fetch(`${base}?group=${encodeURIComponent(group)}&file=${encodeURIComponent(file)}`, { method: 'DELETE' }), t('brand.deleteSuccess'))
  }

  const setDefault = (group, file) =>
    act(() => fetch(base, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, default_watermark: file }),
    }), t('brand.defaultSuccess'))

  const saveQuote = () =>
    act(() => fetch(base, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_ci_accent: accent, quote_default_template: template }),
    }), t('brand.saveSuccess'))

  // '' = ค่ากลางของ org · ที่เหลือคือกลุ่มโซเชียล
  const sections = ['', ...(data.groups || [])]
  const cardCls = 'rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4'
  const labelCls = 'block text-sm font-medium text-gray-900 dark:text-disc-text mb-1'

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-disc-muted">{t('brand.description')}</p>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" />

      {sections.map(group => {
        const files = data.files?.[group] || []
        const def = data.defaults?.[group] || ''
        return (
          <div key={group || '__org__'} className={cardCls}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-disc-text truncate">
                  {group || t('brand.orgWide')}
                </p>
                <p className="text-xs text-gray-400 dark:text-disc-muted">
                  {group ? t('brand.groupHint') : t('brand.orgWideHint')}
                </p>
              </div>
              <button type="button" onClick={() => pickFile(group)} disabled={busy}
                className="shrink-0 rounded-lg border border-gray-300 dark:border-disc-border px-3 py-1.5 text-sm text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover disabled:opacity-60">
                {t('brand.upload')}
              </button>
            </div>

            {files.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-disc-muted">{t('brand.empty')}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {files.map(f => {
                  const isDefault = def === f
                  return (
                    <li key={f} className={`rounded-xl border p-2 ${isDefault ? 'border-orange' : 'border-gray-200 dark:border-disc-border'}`}>
                      {/* พื้นตาราง — ลายน้ำส่วนใหญ่เป็นสีขาวโปร่ง มองไม่เห็นบนพื้นขาว */}
                      <div className="flex h-20 items-center justify-center rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${base}?group=${encodeURIComponent(group)}&file=${encodeURIComponent(f)}&raw=1`}
                          alt={f} className="max-h-20 max-w-full object-contain" />
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-600 dark:text-disc-muted" title={f}>{f}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <button type="button" onClick={() => setDefault(group, isDefault ? 'none' : f)} disabled={busy}
                          className={`text-xs ${isDefault ? 'text-orange font-medium' : 'text-gray-500 dark:text-disc-muted hover:underline'} disabled:opacity-60`}>
                          {isDefault ? t('brand.isDefault') : t('brand.setDefault')}
                        </button>
                        <button type="button" onClick={() => removeFile(group, f)} disabled={busy}
                          className="text-xs text-red-accent hover:underline disabled:opacity-60">
                          {t('brand.delete')}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}

      {/* สี CI + สไตล์การ์ดคำคม */}
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-medium text-gray-900 dark:text-disc-text">{t('brand.quoteTitle')}</p>
        <div>
          <label className={labelCls} htmlFor="brand-accent">{t('brand.accentLabel')}</label>
          <div className="flex items-center gap-2">
            <input id="brand-accent" type="color" value={accent || '#ff6a13'} disabled={busy}
              onChange={e => { setAccent(e.target.value); setAccentInput(e.target.value) }}
              className="h-9 w-14 cursor-pointer rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg" />
            <input
              type="text" value={accentInput} disabled={busy} placeholder="#ff6a13"
              onChange={e => setAccentInput(e.target.value)} onBlur={commitAccentText}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
              maxLength={7} spellCheck={false}
              className="w-24 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg px-2 py-1.5 text-sm font-mono text-gray-600 dark:text-disc-muted disabled:opacity-60" />
            {accent && (
              <button type="button" onClick={() => { setAccent(''); setAccentInput('') }} disabled={busy}
                className="text-xs text-gray-500 dark:text-disc-muted hover:underline disabled:opacity-60">
                {t('brand.accentReset')}
              </button>
            )}
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="brand-template">{t('brand.templateLabel')}</label>
          <select id="brand-template" value={template} disabled={busy} onChange={e => setTemplate(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg px-3 py-2 text-sm text-gray-900 dark:text-disc-text">
            <option value="">{t('brand.templateNone')}</option>
            {(data.styles || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={saveQuote} disabled={busy}
            className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light disabled:opacity-60">
            {busy ? t('brand.saving') : t('brand.save')}
          </button>
          {note && <span className="text-sm text-gray-600 dark:text-disc-muted">{note}</span>}
        </div>
      </div>
    </div>
  )
}
