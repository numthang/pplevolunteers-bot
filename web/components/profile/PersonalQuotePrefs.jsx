'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { normalizeHex } from '@/lib/hexColor.js'

// ค่าตั้งการ์ดคำคมของฉัน — ชนะค่าขององค์กร (personal > guild/org > global)
// ไม่ autosave: เป็นช่องกรอก 2 ช่อง → ปุ่มบันทึกตามกติกา Create vs Update ใน CLAUDE.md
export default function PersonalQuotePrefs() {
  const t = useTranslations('profile')
  const [data, setData] = useState(null)
  const [accent, setAccent] = useState('')
  const [accentInput, setAccentInput] = useState('')   // ข้อความในกล่องพิมพ์/วาง hex — sync กับ accent เมื่อค่าถูกต้อง
  const [template, setTemplate] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch('/api/profile/quote')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setData(d)
        setAccent(d.quote_ci_accent || '')
        setAccentInput(d.quote_ci_accent || '')
        setTemplate(d.quote_default_template || '')
      })
      .catch(() => setData(false))
  }, [])

  if (data === null || data === false) return null   // โหลดไม่ได้ = ซ่อนทิ้ง ไม่ขวางหน้าลายน้ำ

  // พิมพ์/วาง hex code เอง — commit ตอน blur/Enter เท่านั้น ไม่ใช่ทุกตัวอักษรที่พิมพ์
  function commitAccentText() {
    const hex = normalizeHex(accentInput)
    if (hex) { setAccent(hex); setAccentInput(hex) }
    else setAccentInput(accent)   // พิมพ์ไม่ครบ/ผิดรูปแบบ → คืนค่าที่ใช้อยู่จริง
  }

  async function save() {
    setBusy(true); setNote('')
    const r = await fetch('/api/profile/quote', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote_ci_accent: accent, quote_default_template: template }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setNote(r.ok ? t('quotePrefs.saveSuccess') : (d.error || t('quotePrefs.saveError')))
  }

  const labelCls = 'block text-sm font-medium text-gray-900 dark:text-disc-text mb-1'

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-disc-text">{t('quotePrefs.title')}</p>
        <p className="text-xs text-gray-400 dark:text-disc-muted">{t('quotePrefs.description')}</p>
      </div>

      <div>
        <label className={labelCls} htmlFor="my-accent">{t('quotePrefs.accentLabel')}</label>
        <div className="flex items-center gap-2">
          <input id="my-accent" type="color" value={accent || '#ff6a13'} disabled={busy}
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
              {t('quotePrefs.reset')}
            </button>
          )}
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="my-template">{t('quotePrefs.templateLabel')}</label>
        <select id="my-template" value={template} disabled={busy} onChange={e => setTemplate(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg px-3 py-2 text-sm text-gray-900 dark:text-disc-text">
          <option value="">{t('quotePrefs.templateNone')}</option>
          {(data.styles || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light disabled:opacity-60">
          {busy ? t('quotePrefs.saving') : t('quotePrefs.save')}
        </button>
        {note && <span className="text-sm text-gray-600 dark:text-disc-muted">{note}</span>}
      </div>
    </div>
  )
}
