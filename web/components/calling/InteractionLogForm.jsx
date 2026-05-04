'use client'

import { useState, useCallback } from 'react'
import { SIGNALS, SIGNAL_OPTIONS } from '@/lib/callingSignals.js'

export default function InteractionLogForm({ contactId, onSaved }) {
  const [note, setNote] = useState('')
  const [signals, setSignals] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const computeOverall = useCallback(() => {
    const vals = SIGNALS.map(s => signals[s.key]).filter(Boolean)
    if (!vals.length) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }, [signals])

  const signalsFilled = SIGNALS.some(s => signals[s.key])
  const canSave = note.trim() && signalsFilled

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/calling/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: 0,
          contact_type: 'contact',
          member_id: contactId,
          status: 'met',
          sig_overall: computeOverall(),
          sig_location:     signals.sig_location || null,
          sig_availability: signals.sig_availability || null,
          sig_interest:     signals.sig_interest || null,
          note: note.trim(),
        }),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'บันทึกไม่สำเร็จ') }
      setNote('')
      setSignals({})
      onSaved?.()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">
          บันทึกการพบปะ <span className="text-red-500">*</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="เช่น เจอที่งาน event ราชบุรี / นัดเจอที่ร้านกาแฟ"
          className="w-full px-3 py-2 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal resize-none"
        />
      </div>

      <div className="space-y-3">
        {SIGNALS.map(sig => (
          <div key={sig.key}>
            <div className="text-sm font-medium text-warm-700 dark:text-disc-muted mb-1.5">{sig.label}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {SIGNAL_OPTIONS.map(opt => {
                const active = signals[sig.key] === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSignals(prev => ({ ...prev, [sig.key]: opt.value }))}
                    className={`py-2 px-1 rounded-md border transition text-center flex flex-col items-center gap-0.5 ${
                      active
                        ? 'bg-teal border-teal text-white'
                        : 'border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text bg-card-bg hover:border-teal hover:text-teal'
                    }`}
                  >
                    <span className="text-base font-medium">{opt.label}</span>
                    <span className={`text-xs ${active ? 'text-white/80' : 'text-warm-400 dark:text-disc-muted'}`}>{sig.hints[opt.value]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="px-4 py-2 text-base font-medium rounded-lg bg-teal hover:opacity-90 text-white disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึกการพบปะ'}
        </button>
      </div>
    </div>
  )
}
