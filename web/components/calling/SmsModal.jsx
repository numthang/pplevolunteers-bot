'use client'

import { useState, useEffect } from 'react'

const MAX_THAI_PER_SMS = 70
const CONFIRM_THRESHOLD = 50

export default function SmsModal({ isOpen, count, campaignId, contactType, memberIds, defaultMessage = '', onClose, onDone }) {
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
      setResult({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
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
      <div className="bg-white dark:bg-warm-dark-100 rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">ส่ง SMS</h2>
          <button onClick={onClose} className="text-warm-400 hover:text-warm-900 dark:hover:text-disc-text text-2xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition">×</button>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <div className="text-base text-warm-600 dark:text-disc-muted bg-warm-50 dark:bg-warm-dark-200 px-4 py-3 rounded-lg">
                ส่งให้ <strong className="text-warm-900 dark:text-disc-text">{count} คน</strong>
                {' · '}ประมาณ <strong className="text-warm-900 dark:text-disc-text">{creditEst} SMS</strong>
                {smsCount > 1 && <span className="text-amber-600 dark:text-amber-400"> ({smsCount} SMS/คน)</span>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-base font-medium text-warm-700 dark:text-disc-text">ข้อความ</label>
                  <span className={`text-base tabular-nums ${charCount > MAX_THAI_PER_SMS ? 'text-amber-600 dark:text-amber-400' : 'text-warm-400 dark:text-disc-muted'}`}>
                    {charCount}/{MAX_THAI_PER_SMS * smsCount}
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  placeholder="กรอกข้อความ SMS..."
                  autoFocus
                  className="w-full px-3 py-2.5 text-base border border-warm-200 dark:border-disc-border bg-white dark:bg-warm-dark-200 text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <p className="text-base text-amber-600 dark:text-amber-400 mt-1">
                  ⚠️ ข้อความ 70 ตัว = 1 sms การส่ง SMS มีค่าใช้จ่าย 1 sms ต่อ 0.58 สตางค์
                </p>
              </div>

              {needsConfirm && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-base text-red-700 dark:text-red-400 font-medium">
                    จะส่ง SMS ให้ <strong>{count} คน</strong> ใช้ประมาณ <strong>{creditEst} SMS</strong> — พิมพ์จำนวนคนเพื่อยืนยัน
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={confirmInput}
                    onChange={e => setConfirmInput(e.target.value)}
                    placeholder={`พิมพ์ ${count}`}
                    className="w-full h-11 px-3 text-base border border-red-300 dark:border-red-700 bg-white dark:bg-warm-dark-200 text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-warm-200 dark:border-disc-border">
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || loading || !confirmOk}
                  className="flex-1 px-4 py-3 bg-teal hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition"
                >
                  {loading ? 'กำลังส่ง...' : `ส่ง SMS (${count} คน)`}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-3 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition"
                >
                  ยกเลิก
                </button>
              </div>
            </>
          ) : (
            <>
              {result.success ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-base font-medium text-green-700 dark:text-green-400">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0"><polyline points="20 6 9 17 4 12" /></svg>
                    ส่งสำเร็จ
                  </div>
                  <div className="bg-warm-50 dark:bg-warm-dark-200 rounded-lg px-4 py-3 text-base space-y-1">
                    <div className="flex justify-between"><span className="text-warm-500 dark:text-disc-muted">ส่งสำเร็จ</span><span className="font-medium text-warm-900 dark:text-disc-text">{result.sent} คน</span></div>
                    {result.failed > 0 && <div className="flex justify-between"><span className="text-warm-500 dark:text-disc-muted">ส่งไม่สำเร็จ</span><span className="font-medium text-red-600 dark:text-red-400">{result.failed} คน</span></div>}
                    {result.no_phone > 0 && <div className="flex justify-between"><span className="text-warm-500 dark:text-disc-muted">ไม่มีเบอร์</span><span className="font-medium text-warm-500 dark:text-disc-muted">{result.no_phone} คน</span></div>}
                  </div>
                </div>
              ) : (
                <div className="text-base text-red-600 dark:text-red-400">{result.error || 'เกิดข้อผิดพลาด'}</div>
              )}
              <div className="pt-2 border-t border-warm-200 dark:border-disc-border">
                <button onClick={onClose} className="w-full px-4 py-3 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition">
                  ปิด
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
