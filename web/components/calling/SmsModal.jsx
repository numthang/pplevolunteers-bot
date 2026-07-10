'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

const MAX_THAI_PER_SMS = 70
const CONFIRM_THRESHOLD = 50

export default function SmsModal({ isOpen, count, campaignId, contactType, memberIds, defaultMessage = '', onClose, onDone }) {
  const t = useTranslations('calling')
  const [message, setMessage] = useState(defaultMessage)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [confirmInput, setConfirmInput] = useState('')

  const needsConfirm = count > CONFIRM_THRESHOLD
  const confirmOk = !needsConfirm || confirmInput === String(count)

  useEffect(() => {
    if (!isOpen) { setMessage(defaultMessage); setResult(null); setConfirmInput('') }
  }, [isOpen, defaultMessage])

  const charCount = message.length
  const smsCount  = charCount === 0 ? 1 : Math.ceil(charCount / MAX_THAI_PER_SMS)
  const creditEst = smsCount * count

  async function handleSend() {
    if (!message.trim() || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/calling/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId, contact_type: contactType, member_ids: memberIds, message }),
      })
      const data = await res.json()
      setResult(data)
      if (data.success) onDone?.()
    } catch {
      setResult({ error: t('smsModal.sendError') })
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white dark:bg-disc-hover rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">{t('smsModal.title')}</h2>
          <button onClick={onClose} className="text-warm-400 hover:text-warm-900 dark:hover:text-disc-text text-2xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-disc-hover transition">×</button>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <div className="text-base text-warm-600 dark:text-disc-muted bg-warm-50 dark:bg-disc-header px-4 py-3 rounded-lg">
                {t('smsModal.sendToPrefix')} <strong className="text-warm-900 dark:text-disc-text">{t('smsModal.peopleCount', { count })}</strong>
                {' · '}{t('smsModal.estimatedPrefix')} <strong className="text-warm-900 dark:text-disc-text">{t('smsModal.smsCountLabel', { count: creditEst })}</strong>
                {smsCount > 1 && <span className="text-amber-600 dark:text-amber-400"> {t('smsModal.perPersonNote', { count: smsCount })}</span>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-base font-medium text-warm-700 dark:text-disc-text">{t('smsModal.messageLabel')}</label>
                  <span className={`text-base tabular-nums ${charCount > MAX_THAI_PER_SMS ? 'text-amber-600 dark:text-amber-400' : 'text-warm-400 dark:text-disc-muted'}`}>
                    {charCount}/{MAX_THAI_PER_SMS * smsCount}
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  placeholder={t('smsModal.messagePlaceholder')}
                  autoFocus
                  className="w-full px-3 py-2.5 text-base border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-header text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <p className="text-base text-amber-600 dark:text-amber-400 mt-1">
                  {t('smsModal.costWarning')}
                </p>
              </div>

              {needsConfirm && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-base text-red-700 dark:text-red-400 font-medium">
                    {t('smsModal.confirmPrefix')} <strong>{t('smsModal.peopleCount', { count })}</strong> {t('smsModal.confirmMiddle')} <strong>{t('smsModal.smsCountLabel', { count: creditEst })}</strong> {t('smsModal.confirmSuffix')}
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={confirmInput}
                    onChange={e => setConfirmInput(e.target.value)}
                    placeholder={t('smsModal.confirmInputPlaceholder', { count })}
                    className="w-full h-11 px-3 text-base border border-red-300 dark:border-red-700 bg-white dark:bg-disc-header text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-warm-200 dark:border-disc-border">
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || loading || !confirmOk}
                  className="flex-1 px-4 py-3 bg-teal hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition"
                >
                  {loading ? t('smsModal.sending') : t('smsModal.sendButton', { count })}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              {result.success ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-base font-medium text-green-700 dark:text-green-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                    {t('smsModal.sentLabel')}
                  </div>
                  <div className="bg-warm-50 dark:bg-disc-header rounded-lg px-4 py-3 text-base space-y-1">
                    <div className="flex justify-between"><span className="text-warm-500 dark:text-disc-muted">{t('smsModal.sentLabel')}</span><span className="font-medium text-warm-900 dark:text-disc-text">{t('smsModal.peopleCount', { count: result.sent })}</span></div>
                    {result.failed > 0 && <div className="flex justify-between"><span className="text-warm-500 dark:text-disc-muted">{t('smsModal.failedLabel')}</span><span className="font-medium text-red-600 dark:text-red-400">{t('smsModal.peopleCount', { count: result.failed })}</span></div>}
                    {result.no_phone > 0 && <div className="flex justify-between"><span className="text-warm-500 dark:text-disc-muted">{t('assignment.noPhoneLabel')}</span><span className="font-medium text-warm-500 dark:text-disc-muted">{t('smsModal.peopleCount', { count: result.no_phone })}</span></div>}
                  </div>
                </div>
              ) : (
                <div className="text-base text-red-600 dark:text-red-400">{result.error || t('assignment.genericError')}</div>
              )}
              <div className="pt-2 border-t border-warm-200 dark:border-disc-border">
                <button onClick={onClose} className="w-full px-4 py-3 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover transition">
                  {t('common.close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
