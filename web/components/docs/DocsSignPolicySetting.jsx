'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, X } from 'lucide-react'

const MODES = ['strict', 'flexible']

/**
 * โหมดการเซ็นใบสำคัญรับเงินของ org
 *
 * เลือกแล้วมีผลทันที (ไม่มีปุ่มบันทึก) — เป็น toggle ค่าเดียว ไม่ใช่ฟอร์ม
 * ปุ่มบันทึกสำหรับ radio 2 ตัวคือขั้นตอนเกิน · มีป้ายบอกสถานะแทนตามกฎ Update
 */
export default function DocsSignPolicySetting() {
  const t = useTranslations('docs')
  const [policy, setPolicy]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch('/api/docs/sign-policy')
      .then(r => r.json())
      .then(d => setPolicy(d?.data?.policy ?? 'strict'))
      .catch(() => setPolicy('strict'))
  }, [])

  async function pick(next) {
    if (next === policy || saving) return
    const prev = policy
    setPolicy(next)          // optimistic — ค่านี้ย้อนได้ ไม่ต้องรอ round-trip
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/docs/sign-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error || t('signPolicy.saveFailed'))
      setSavedAt(true)
      setTimeout(() => setSavedAt(false), 2000)
    } catch (e) {
      setPolicy(prev)
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (policy === null) return null

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden mt-6">
      <div className="px-4 py-3 border-b border-warm-200 dark:border-disc-border flex items-center justify-between">
        <span className="text-base font-semibold text-warm-700 dark:text-disc-text">{t('signPolicy.heading')}</span>
        {saving  && <span className="text-sm text-warm-400 dark:text-disc-muted">{t('signPolicy.saving')}</span>}
        {savedAt && <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400"><Check size={14} />{t('signPolicy.saved')}</span>}
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <ul className="divide-y divide-warm-100 dark:divide-disc-border">
        {MODES.map(m => (
          <li key={m}>
            <button
              type="button"
              onClick={() => pick(m)}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-warm-50 dark:hover:bg-disc-hover transition-colors"
            >
              <span className={`mt-1 w-4 h-4 rounded-full border-2 shrink-0 ${policy === m
                ? 'border-orange bg-orange'
                : 'border-warm-300 dark:border-disc-border'}`} />
              <span className="min-w-0">
                <span className="block text-base text-warm-900 dark:text-disc-text">{t(`signPolicy.${m}.label`)}</span>
                <span className="block text-sm text-warm-500 dark:text-disc-muted">{t(`signPolicy.${m}.description`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="px-4 py-3 border-t border-warm-200 dark:border-disc-border text-sm text-warm-400 dark:text-disc-muted">
        {t('signPolicy.auditNote')}
      </p>
    </div>
  )
}
