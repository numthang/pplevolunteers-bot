'use client'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

// ตั้งค่า AI ราย org — API key ของตัวเอง + โมเดล (owner only)
// ไม่ autosave โดยตั้งใจ: ฟอร์มนี้มีช่อง API key ที่พิมพ์ทีละตัว autosave จะยิงค่าครึ่งๆ กลางๆ ลง DB
// (กติกา Create vs Update ใน CLAUDE.md — Update ที่ไม่มี autosave ต้องมีปุ่มบันทึก)
export default function OrgAi({ orgId }) {
  const t = useTranslations('org')
  const [data, setData] = useState(null)      // null=loading · false=ไม่มีสิทธิ์
  const [provider, setProvider] = useState('claude')
  const [modelLight, setModelLight] = useState('')
  const [modelWriting, setModelWriting] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetch(`/api/org/orgs/${orgId}/ai`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => {
        setData(d)
        setProvider(d.provider || 'claude')
        setModelLight(d.modelLight || '')
        setModelWriting(d.modelWriting || '')
      })
      .catch(() => setData(false))
  }, [orgId])

  if (data === null) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('ai.loading')}</p>
  if (data === false) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('ai.ownerOnly')}</p>

  async function send(patch, okMsg) {
    setBusy(true); setNote('')
    const r = await fetch(`/api/org/orgs/${orgId}/ai`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setNote(d.error || t('ai.saveError')); return false }
    setData(prev => ({ ...prev, ...d }))
    setNote(okMsg)
    return true
  }

  async function save() {
    const patch = { provider, modelLight, modelWriting }
    if (keyInput.trim()) patch[`apiKey_${provider}`] = keyInput.trim()
    if (await send(patch, t('ai.saveSuccess'))) setKeyInput('')
  }

  async function removeKey(p) {
    if (!confirm(t('ai.removeKeyConfirm'))) return
    await send({ [`apiKey_${p}`]: null }, t('ai.removeKeySuccess'))
  }

  const hasOwnKey = data.hasKey?.[provider]
  const defaults = data.defaultModel?.[provider] || {}
  const inputCls = 'w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-card-bg px-3 py-2 text-sm text-gray-900 dark:text-disc-text placeholder:text-gray-400 dark:placeholder:text-disc-muted'
  const labelCls = 'block text-sm font-medium text-gray-900 dark:text-disc-text mb-1'

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-disc-muted">{t('ai.description')}</p>

      {!data.ready && (
        <p className="rounded-2xl border border-amber-300 bg-amber-50 dark:border-disc-border dark:bg-card-bg p-3 text-sm text-amber-900 dark:text-disc-text">
          {t('ai.serverNotReady')}
        </p>
      )}

      {/* ค่าย */}
      <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4">
        <span className={labelCls}>{t('ai.providerLabel')}</span>
        <div className="flex flex-wrap gap-2">
          {(data.providers || []).map(p => (
            <button key={p} type="button" onClick={() => setProvider(p)} disabled={busy}
              className={`px-3 py-1.5 text-sm rounded-lg border transition disabled:opacity-60 ${
                provider === p
                  ? 'border-orange bg-orange text-white'
                  : 'border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover'
              }`}>
              {t(`ai.provider.${p}`)}
              {data.hasKey?.[p] && <span className="ml-1.5 text-xs">●</span>}
            </button>
          ))}
        </div>
      </div>

      {/* API key */}
      <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 space-y-2">
        <label className={labelCls} htmlFor="ai-key">{t('ai.keyLabel')}</label>
        <p className="text-xs text-gray-400 dark:text-disc-muted">
          {hasOwnKey ? t('ai.keySetNote') : t('ai.keyEmptyNote')}
        </p>
        <input id="ai-key" type="password" autoComplete="off" value={keyInput} disabled={busy || !data.ready}
          onChange={e => setKeyInput(e.target.value)}
          placeholder={hasOwnKey ? t('ai.keyPlaceholderReplace') : t('ai.keyPlaceholder')}
          className={inputCls} />
        {hasOwnKey && (
          <button type="button" onClick={() => removeKey(provider)} disabled={busy}
            className="text-sm text-red-accent hover:underline disabled:opacity-60">
            {t('ai.removeKey')}
          </button>
        )}
      </div>

      {/* โมเดล */}
      <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 space-y-3">
        <p className="text-xs text-gray-400 dark:text-disc-muted">{t('ai.modelNote')}</p>
        <div>
          <label className={labelCls} htmlFor="ai-model-light">{t('ai.modelLightLabel')}</label>
          <input id="ai-model-light" value={modelLight} disabled={busy || !hasOwnKey}
            onChange={e => setModelLight(e.target.value)}
            placeholder={defaults.light || ''} className={inputCls} />
          <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('ai.modelLightHint')}</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="ai-model-writing">{t('ai.modelWritingLabel')}</label>
          <input id="ai-model-writing" value={modelWriting} disabled={busy || !hasOwnKey}
            onChange={e => setModelWriting(e.target.value)}
            placeholder={defaults.writing || ''} className={inputCls} />
          <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('ai.modelWritingHint')}</p>
        </div>
        {!hasOwnKey && <p className="text-xs text-gray-400 dark:text-disc-muted">{t('ai.modelLockedNote')}</p>}
      </div>

      {/* โควตายืม key กลาง — อ่านอย่างเดียว เจ้าของระบบเป็นคนตั้ง */}
      {!hasOwnKey && (
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4">
          <p className="text-sm font-medium text-gray-900 dark:text-disc-text">
            {t('ai.quotaTitle', { used: data.sharedQuota?.used ?? 0, limit: data.sharedQuota?.limit ?? 0 })}
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('ai.quotaNote')}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-lg bg-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-light disabled:opacity-60">
          {busy ? t('ai.saving') : t('ai.save')}
        </button>
        {note && <span className="text-sm text-gray-600 dark:text-disc-muted">{note}</span>}
      </div>
    </div>
  )
}
