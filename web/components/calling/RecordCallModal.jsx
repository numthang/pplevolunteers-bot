'use client'

import { useState, useEffect, useCallback } from 'react'

const CALL_STATUS_OPTIONS = [
  { value: 'answered',      label: 'รับสาย',   color: '#0d9e94', bg: '#e1f5f4' },
  { value: 'no_answer',     label: 'ไม่รับ',    color: '#854f0b', bg: '#faeeda' },
  { value: 'busy',          label: 'ไม่ว่าง',   color: '#d4537e', bg: '#fbeaf0' },
  { value: 'wrong_number',  label: 'เบอร์ผิด',  color: '#a32d2d', bg: '#fcebeb' },
]

const SIGNALS = [
  {
    key: 'sig_location',
    label: 'ที่อยู่',
    hint: 'สมาชิกอยู่ที่ไหนในช่วงนี้',
    options: [
      { value: 4, label: 'ในอำเภอ' },
      { value: 3, label: 'ในจังหวัด' },
      { value: 2, label: 'ต่างจังหวัด' },
      { value: 1, label: 'ต่างประเทศ' },
    ],
  },
  {
    key: 'sig_availability',
    label: 'ความว่าง',
    hint: 'มีเวลาร่วมกิจกรรมได้มากแค่ไหน',
    options: [
      { value: 4, label: 'ว่างมาก' },
      { value: 3, label: 'ว่างบ้าง' },
      { value: 2, label: 'ไม่ค่อยว่าง' },
      { value: 1, label: 'ไม่ว่างเลย' },
    ],
  },
  {
    key: 'sig_interest',
    label: 'ความสนใจ',
    hint: 'สนใจเข้าร่วมกิจกรรมของพรรคมากแค่ไหน',
    options: [
      { value: 4, label: 'กระตือรือร้น' },
      { value: 3, label: 'สนใจ' },
      { value: 2, label: 'สนใจนิดหน่อย' },
      { value: 1, label: 'ไม่สนใจ' },
    ],
  },
  {
    key: 'sig_reachable',
    label: 'การติดต่อ',
    hint: 'ติดต่อได้ง่ายแค่ไหน',
    options: [
      { value: 4, label: 'รับสายทันที' },
      { value: 3, label: 'ติดได้' },
      { value: 2, label: 'ติดยาก' },
      { value: 1, label: 'ไม่ติดเลย' },
    ],
  },
]

const LOG_STATUS_LABEL = {
  answered:     { label: 'รับสาย',   color: '#0d9e94', bg: '#e1f5f4' },
  no_answer:    { label: 'ไม่รับ',    color: '#854f0b', bg: '#faeeda' },
  busy:         { label: 'ไม่ว่าง',   color: '#d4537e', bg: '#fbeaf0' },
  wrong_number: { label: 'เบอร์ผิด',  color: '#a32d2d', bg: '#fcebeb' },
}

const TIER_COLORS = {
  A: { bg: '#ead3ce', text: '#714b2b' },
  B: { bg: '#cce5f4', text: '#0c447c' },
  C: { bg: '#faeeda', text: '#854f0b' },
  D: { bg: '#fcebeb', text: '#a32d2d' },
}

function SignalScoreLabel({ signalKey, value }) {
  const sig = SIGNALS.find(s => s.key === signalKey)
  if (!sig || !value) return <span className="text-warm-400">—</span>
  const opt = sig.options.find(o => o.value === value)
  return <span>{opt?.label || value}</span>
}

function formatDate(val) {
  if (!val) return '—'
  return new Date(val).toLocaleString('th-TH', {
    day: '2-digit', month: 'short', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function RecordCallModal({ isOpen, member, onClose, onSave, onSaveAndNext, hasNext }) {
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [signals, setSignals] = useState({})
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Reset form when member changes
  useEffect(() => {
    setStatus('')
    setNote('')
    setSignals({})
    setSaving(false)
    if (isOpen && member?.source_id) {
      setHistoryLoading(true)
      fetch(`/api/calling/logs?memberId=${member.source_id}`)
        .then(r => r.json())
        .then(d => setHistory(d.data || []))
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false))
    }
  }, [member?.source_id, isOpen])

  const computeOverall = useCallback(() => {
    const vals = SIGNALS.map(s => signals[s.key]).filter(Boolean)
    if (!vals.length) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }, [signals])

  const buildPayload = useCallback(() => ({
    campaign_id: member?.campaign_id || 0,
    member_id: member?.source_id,
    status,
    sig_overall: status === 'answered' ? computeOverall() : null,
    sig_location:     status === 'answered' ? (signals.sig_location || null) : null,
    sig_availability: status === 'answered' ? (signals.sig_availability || null) : null,
    sig_interest:     status === 'answered' ? (signals.sig_interest || null) : null,
    sig_reachable:    status === 'answered' ? (signals.sig_reachable || null) : null,
    note: note.trim() || null,
  }), [member, status, signals, note, computeOverall])

  const handleSave = async (goNext = false) => {
    if (!status) return
    setSaving(true)
    try {
      if (goNext) await onSaveAndNext(buildPayload())
      else await onSave(buildPayload())
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !member) return null

  const tier = member.tier || 'D'
  const tierColor = TIER_COLORS[tier]
  const avatarChar = member.first_name?.[0] || member.full_name?.[0] || '?'
  const selectedStatus = CALL_STATUS_OPTIONS.find(s => s.value === status)
  const showSignals = status === 'answered'
  const signalsFilled = SIGNALS.some(s => signals[s.key])
  const canSave = status && (status !== 'answered' || signalsFilled)

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start sm:items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-warm-dark-100 rounded-xl w-full max-w-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-200 dark:border-warm-dark-300">
          <h2 className="text-base font-semibold text-warm-900 dark:text-warm-50">บันทึกการโทร</h2>
          <button
            onClick={onClose}
            className="text-warm-400 hover:text-warm-700 dark:hover:text-warm-200 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
          >×</button>
        </div>

        {/* Body: sidebar first (mobile), form second — reversed on desktop via order */}
        <div className="p-5 flex flex-col md:grid md:grid-cols-[1fr_280px] gap-5">

          {/* SIDEBAR — appears first on mobile, right column on desktop */}
          <div className="md:order-2 bg-warm-50 dark:bg-warm-dark-200 rounded-lg p-5 flex flex-col gap-5">

            {/* Avatar + Name — centered */}
            <div className="text-center pb-4 border-b border-warm-200 dark:border-warm-dark-300">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-semibold mx-auto mb-3"
                style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
              >
                {avatarChar}
              </div>
              <div className="font-semibold text-sm text-warm-900 dark:text-warm-50">{member.full_name}</div>
              <div className="text-xs text-warm-500 dark:text-warm-dark-500 mt-1">
                Tier {tier} · {member.home_amphure || '—'}
              </div>
            </div>

            {/* Contact section */}
            <div>
              <div className="text-xs font-semibold text-warm-400 dark:text-warm-dark-400 uppercase tracking-wider mb-2">Contact</div>
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-warm-400 dark:text-warm-dark-400">Phone</div>
                  {member.mobile_number ? (
                    <a href={`tel:${member.mobile_number}`}
                      className="font-semibold text-teal hover:underline mt-0.5 block">
                      {member.mobile_number}
                    </a>
                  ) : (
                    <div className="text-warm-400 dark:text-warm-dark-400 mt-0.5">ไม่มีเบอร์โทร</div>
                  )}
                </div>
                {member.line_id && (
                  <div>
                    <div className="text-warm-400 dark:text-warm-dark-400">LINE</div>
                    <div className="font-semibold text-warm-900 dark:text-warm-50 mt-0.5">{member.line_id}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Location section */}
            <div>
              <div className="text-xs font-semibold text-warm-400 dark:text-warm-dark-400 uppercase tracking-wider mb-2">Location</div>
              <div className="space-y-2 text-xs">
                {member.home_province && (
                  <div>
                    <div className="text-warm-400 dark:text-warm-dark-400">จังหวัด</div>
                    <div className="font-semibold text-warm-900 dark:text-warm-50 mt-0.5">{member.home_province}</div>
                  </div>
                )}
                {member.home_amphure && (
                  <div>
                    <div className="text-warm-400 dark:text-warm-dark-400">อำเภอ</div>
                    <div className="font-semibold text-warm-900 dark:text-warm-50 mt-0.5">{member.home_amphure}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Campaign section */}
            <div>
              <div className="text-xs font-semibold text-warm-400 dark:text-warm-dark-400 uppercase tracking-wider mb-2">Campaign</div>
              <div className="bg-white dark:bg-warm-dark-100 rounded-lg p-3 text-xs">
                <div className="text-warm-400 dark:text-warm-dark-400">Campaign</div>
                <div className="font-semibold text-warm-900 dark:text-warm-50 mt-0.5">{member.campaign_name || '—'}</div>
              </div>
            </div>

            {/* Call button */}
            {member.mobile_number && (
              <a
                href={`tel:${member.mobile_number}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-teal hover:opacity-90 text-white text-sm font-semibold rounded-lg transition"
              >
                <span>📞</span>
                <span>โทร {member.mobile_number}</span>
              </a>
            )}
          </div>

          {/* MAIN FORM — second on mobile, left column on desktop */}
          <div className="md:order-1 flex flex-col gap-4">

            {/* Call status */}
            <div>
              <div className="text-xs font-semibold text-warm-700 dark:text-warm-200 mb-2">สถานะการโทร *</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CALL_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`py-2.5 px-2 text-sm rounded-lg border transition font-medium ${
                      status === opt.value
                        ? ''
                        : 'border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
                    }`}
                    style={status === opt.value
                      ? { backgroundColor: opt.bg, borderColor: opt.color, color: opt.color }
                      : {}
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Status indicator */}
              {selectedStatus && (
                <div
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: selectedStatus.bg, color: selectedStatus.color }}
                >
                  {status === 'answered' && '✓ '}
                  {status === 'no_answer' && '⊘ '}
                  {status === 'busy' && '≈ '}
                  {status === 'wrong_number' && '✗ '}
                  {selectedStatus.label}
                </div>
              )}
            </div>

            {/* Note */}
            <div>
              <div className="text-xs font-semibold text-warm-700 dark:text-warm-200 mb-2">บันทึกการโทร</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="เช่น ทำงานอยู่กรุงเทพ กลับบ้านเดือนละครั้ง สนใจร่วมกิจกรรมช่วงปลายปี"
                className="w-full px-3 py-2 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 placeholder-warm-400 dark:placeholder-warm-dark-400 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            {/* Signals — show only when answered */}
            {showSignals && (
              <div className="bg-warm-50 dark:bg-warm-dark-200 rounded-lg p-4 space-y-4">
                <div className="text-xs font-semibold text-warm-700 dark:text-warm-200">Signal การโทร</div>
                {SIGNALS.map(sig => (
                  <div key={sig.key}>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-warm-700 dark:text-warm-200">{sig.label}</span>
                      <span className="text-xs text-warm-400 dark:text-warm-dark-400">{sig.hint}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {sig.options.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSignals(prev => ({ ...prev, [sig.key]: opt.value }))}
                          className={`py-1.5 px-1 text-xs rounded-md border transition text-center font-medium ${
                            signals[sig.key] === opt.value
                              ? 'bg-teal border-teal text-white'
                              : 'border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 bg-white dark:bg-warm-dark-100 hover:border-teal hover:text-teal'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Call History */}
            <div>
              <div className="text-xs font-semibold text-warm-700 dark:text-warm-200 mb-2">
                ประวัติการโทร
                {history.length > 0 && (
                  <span className="ml-2 font-normal text-warm-400 dark:text-warm-dark-400">
                    ({history.filter(l => l.status === 'answered').length}/{history.length} รับสาย)
                  </span>
                )}
              </div>
              {historyLoading ? (
                <div className="text-xs text-warm-400 dark:text-warm-dark-400 py-2">กำลังโหลด...</div>
              ) : history.length === 0 ? (
                <div className="text-xs text-warm-400 dark:text-warm-dark-400 py-2">ยังไม่มีประวัติการโทร</div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {history.map(log => {
                    const s = LOG_STATUS_LABEL[log.status] || { label: log.status, color: '#888', bg: '#eee' }
                    return (
                      <div
                        key={log.id}
                        className="text-xs border border-warm-200 dark:border-warm-dark-300 rounded-lg p-3 bg-white dark:bg-warm-dark-100"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span
                            className="px-2 py-0.5 rounded font-semibold"
                            style={{ backgroundColor: s.bg, color: s.color }}
                          >{s.label}</span>
                          <span className="text-warm-400 dark:text-warm-dark-400 whitespace-nowrap">{formatDate(log.called_at)}</span>
                        </div>
                        {log.note && (
                          <div className="text-warm-600 dark:text-warm-dark-300 mt-1 leading-relaxed">{log.note}</div>
                        )}
                        {log.status === 'answered' && (log.sig_location || log.sig_availability || log.sig_interest || log.sig_reachable) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-warm-500 dark:text-warm-dark-500">
                            {log.sig_location && (
                              <span>📍 <SignalScoreLabel signalKey="sig_location" value={log.sig_location} /></span>
                            )}
                            {log.sig_availability && (
                              <span>🕐 <SignalScoreLabel signalKey="sig_availability" value={log.sig_availability} /></span>
                            )}
                            {log.sig_interest && (
                              <span>⭐ <SignalScoreLabel signalKey="sig_interest" value={log.sig_interest} /></span>
                            )}
                            {log.sig_reachable && (
                              <span>📶 <SignalScoreLabel signalKey="sig_reachable" value={log.sig_reachable} /></span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-warm-200 dark:border-warm-dark-300">
              {showSignals && !signalsFilled && (
                <p className="w-full text-xs text-orange-500 mb-1">กรุณาเลือก signal อย่างน้อย 1 ด้าน</p>
              )}
              {hasNext && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={!canSave || saving}
                  className="flex-1 py-2.5 bg-teal hover:opacity-90 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก & โทรคนต่อไป →'}
                </button>
              )}
              <button
                onClick={() => handleSave(false)}
                disabled={!canSave || saving}
                className={`py-2.5 text-sm font-semibold rounded-lg border transition disabled:opacity-40 ${
                  hasNext
                    ? 'px-4 border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
                    : 'flex-1 bg-teal hover:opacity-90 text-white border-teal'
                }`}
              >
                {saving ? 'กำลังบันทึก...' : hasNext ? 'บันทึก' : 'บันทึกการโทร'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm text-warm-500 dark:text-warm-dark-500 hover:text-warm-700 dark:hover:text-warm-200 rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
