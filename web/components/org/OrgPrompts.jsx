'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

// prompt ของ AI ทุกช่องที่ผูกกับโค้ด — แก้ทับได้ราย org (owner only)
//
// ไม่ autosave โดยตั้งใจ (เหมือน OrgAi.jsx ข้างกัน): prompt เป็นข้อความยาวที่พิมพ์แก้ทีละคำ
// autosave จะยิงค่าครึ่งๆ กลางๆ ลง DB แล้ว AI ทำงานด้วย prompt ที่ยังพิมพ์ไม่จบ
// → Update ที่ไม่มี autosave ต้องมีปุ่มบันทึก (กติกา Create vs Update ใน CLAUDE.md)
export default function OrgPrompts({ orgId }) {
  const t = useTranslations('org')
  const [prompts, setPrompts] = useState(null)   // null=loading · false=ไม่มีสิทธิ์
  const [open, setOpen] = useState('')            // value ของช่องที่กางอยู่ (ทีละช่อง)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/org/orgs/${orgId}/prompts`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setPrompts(d.prompts))
      .catch(() => setPrompts(false))
  }, [orgId])

  if (prompts === null) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('prompts.loading')}</p>
  if (prompts === false) return null   // ไม่ใช่ owner — การ์ด AI ข้างบนบอกไปแล้ว ไม่ต้องซ้ำ

  function expand(p) {
    setErr(''); setNote('')
    if (open === p.value) { setOpen(''); return }
    setOpen(p.value)
    setDraft(p.prompt)
  }

  async function call(method, body, okMsg) {
    setBusy(true); setErr(''); setNote('')
    const url = `/api/org/orgs/${orgId}/prompts${method === 'DELETE' ? `?value=${encodeURIComponent(body.value)}` : ''}`
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(d.error || t('prompts.saveError')); return }
    setPrompts(d.prompts)
    setNote(okMsg)
    const fresh = d.prompts.find(x => x.value === body.value)
    if (fresh) setDraft(fresh.prompt)
  }

  const surfaces = [...new Set(prompts.map(p => p.surface))]
  const areaCls = 'w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg px-3 py-2 text-sm text-gray-900 dark:text-disc-text font-mono leading-relaxed'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-gray-900 dark:text-disc-text">{t('prompts.title')}</h2>
        <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('prompts.description')}</p>
      </div>

      {surfaces.map(sf => (
        <div key={sf} className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 space-y-2">
          <span className="block text-sm font-medium text-gray-900 dark:text-disc-text mb-1">
            {t(`prompts.surface.${sf}`)}
          </span>

          {prompts.filter(p => p.surface === sf).map(p => (
            <div key={p.value} className="border-t border-gray-200 dark:border-disc-border pt-2 first:border-t-0 first:pt-0">
              <button type="button" onClick={() => expand(p)}
                className="w-full flex items-center justify-between gap-2 text-left py-1 hover:opacity-80">
                <span className="text-sm text-gray-900 dark:text-disc-text">{p.label}</span>
                <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${
                  p.isDefault
                    ? 'text-gray-400 dark:text-disc-muted'
                    : 'bg-orange/10 text-orange'
                }`}>
                  {p.isDefault ? t('prompts.isDefault') : t('prompts.isCustom')}
                </span>
              </button>

              {open === p.value && (
                <div className="space-y-2 pb-2">
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} rows={14}
                    className={areaCls} />

                  {/* คีย์ที่ห้ามหาย — บอกไว้ก่อน ดีกว่าให้เจอตอนกดบันทึกแล้วโดนปฏิเสธ */}
                  {p.requiredKeys.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-disc-muted">
                      {t('prompts.requiredKeys', { keys: p.requiredKeys.join(', ') })}
                    </p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" disabled={busy || draft.trim() === p.prompt.trim()}
                      onClick={() => call('PUT', { value: p.value, prompt: draft }, t('prompts.saveSuccess'))}
                      className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light disabled:opacity-60">
                      {busy ? t('prompts.saving') : t('prompts.save')}
                    </button>

                    {!p.isDefault && (
                      <button type="button" disabled={busy}
                        onClick={() => call('DELETE', { value: p.value }, t('prompts.resetSuccess'))}
                        className="text-sm text-red-accent hover:underline disabled:opacity-60">
                        {t('prompts.reset')}
                      </button>
                    )}

                    {draft.trim() !== p.prompt.trim() && (
                      <span className="text-xs text-amber-600 dark:text-amber-500">{t('prompts.unsaved')}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {err && <p className="text-sm text-red-accent">{err}</p>}
      {note && <p className="text-sm text-gray-600 dark:text-disc-muted">{note}</p>}
    </div>
  )
}
