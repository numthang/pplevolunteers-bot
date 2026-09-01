'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Sparkles, Loader2 } from 'lucide-react'
import CaseLetterModal from '@/components/case/CaseLetterModal.jsx'

const AI_MODES = ['summary', 'letter']

/**
 * ปุ่ม AI เดียว — เลือกโหมดจาก dropdown แล้วกด "ให้ AI ช่วย" (เลียนแบบ PostEditor.jsx)
 * แทนที่ปุ่ม "ร่างหนังสือร้องเรียน" เดี่ยวๆ เดิมใน CaseManageActions
 * - summary → ยิง /ai/summary เขียนทับ cases.ai_summary แล้ว router.refresh() ให้การ์ดเนื้อหาเห็นค่าใหม่
 * - letter  → เปิด CaseLetterModal เหมือนเดิม (ปุ่มเดิมเปิดโมดัลตรงๆ)
 */
export default function CaseAiActions({ refId }) {
  const t = useTranslations('case')
  const router = useRouter()
  const [aiMode, setAiMode] = useState('summary')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showLetter, setShowLetter] = useState(false)

  async function runAi() {
    if (aiMode === 'letter') { setShowLetter(true); return }

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/case/${refId}/ai/summary`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('actions.aiSummaryFailMsg')); return }
      router.refresh()
    } catch {
      setError(t('actions.aiSummaryFailMsg'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {showLetter && <CaseLetterModal refId={refId} onClose={() => setShowLetter(false)} />}
      <div className="flex items-center">
        <select
          value={aiMode}
          onChange={e => setAiMode(e.target.value)}
          className="h-9 px-2 text-sm rounded-l-lg border border-r-0 border-gray-300 dark:border-disc-border bg-card-bg text-gray-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-brand-orange"
        >
          {AI_MODES.map(mode => <option key={mode} value={mode}>{t(`actions.aiMode${mode === 'summary' ? 'Summary' : 'Letter'}`)}</option>)}
        </select>
        <button
          onClick={runAi}
          disabled={loading}
          className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-r-lg bg-violet-600 text-white hover:opacity-90 disabled:opacity-40 transition"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {t('actions.aiButton')}
        </button>
      </div>
      {error && <p className="text-sm text-red-500 mt-1.5">{error}</p>}
    </>
  )
}
