'use client'

import { useState, useEffect, useCallback } from 'react'

const CALL_STATUS_OPTIONS = [
  { value: 'answered',      label: 'รับสาย',   color: '#0d9e94', bg: '#e1f5f4' },
  { value: 'no_answer',     label: 'ไม่รับ',    color: '#854f0b', bg: '#faeeda' },
  { value: 'wrong_number',  label: 'เบอร์ผิด',  color: '#a32d2d', bg: '#fcebeb' },
]

const RSVP_OPTIONS = [
  { value: 'joined',     label: 'เข้าร่วม' },
  { value: 'not_joined', label: 'ไม่เข้าร่วม' },
  { value: 'maybe',      label: 'อาจจะ' },
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
      { value: 2, label: 'นิดหน่อย' },
      { value: 1, label: 'ไม่สนใจ' },
    ],
  },
]

const LOG_STATUS_LABEL = {
  answered:     { label: 'รับสาย',   color: '#0d9e94', bg: '#e1f5f4' },
  no_answer:    { label: 'ไม่รับ',    color: '#854f0b', bg: '#faeeda' },
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
  const [rsvp, setRsvp] = useState('')
  const [note, setNote] = useState('')
  const [signals, setSignals] = useState({})
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Reset form when member changes
  useEffect(() => {
    setStatus('')
    setRsvp('')
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
    sig_reachable:    null,
    note: note.trim() || null,
    rsvp_status: status === 'answered' ? (rsvp || null) : null,
  }), [member, status, rsvp, signals, note, computeOverall])

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

        {/* Body: sidebar first (mobile), form second */}
        <div className="p-5 flex flex-col md:grid md:grid-cols-[1fr_280px] gap-5">

          {/* SIDEBAR — appears first on mobile, right column on desktop */}
          <div className="md:order-2 bg-warm-50 dark:bg-warm-dark-200 rounded-lg p-3 flex flex-col gap-3">

            {/* Avatar + Name row — compact like card */}
            <div className="flex items-center gap-2.5 pb-3 border-b border-warm-200 dark:border-warm-dark-300">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
              >
                {avatarChar}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm text-warm-900 dark:text-warm-50 truncate">{member.full_name}</span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                </div>
                <div className="text-xs text-warm-400 dark:text-warm-dark-400 truncate mt-0.5">
                  {[member.home_province, member.home_amphure].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            </div>

            {/* Contact — compact, no headings */}
            <div className="text-xs space-y-1">
              {member.mobile_number ? (
                <a href={`tel:${member.mobile_number}`} className="font-semibold text-teal hover:underline block">
                  {member.mobile_number}
                </a>
              ) : (
                <span className="text-warm-400 dark:text-warm-dark-400">ไม่มีเบอร์โทร</span>
              )}
              {member.line_id && (
                <div className="text-warm-500 dark:text-warm-dark-400">LINE: {member.line_id}</div>
              )}
            </div>

            {/* Call History — compact */}
            <div>
              <div className="text-xs font-semibold text-warm-500 dark:text-warm-dark-400 mb-1.5">
                ประวัติ{history.length > 0 && (
                  <span className="font-normal ml-1">
                    ({history.filter(l => l.status === 'answered').length}/{history.length} รับ)
                  </span>
                )}
              </div>
              {historyLoading ? (
                <div className="text-xs text-warm-400 dark:text-warm-dark-400">โหลด...</div>
              ) : history.length === 0 ? (
                <div className="text-xs text-warm-400 dark:text-warm-dark-400">ยังไม่มี</div>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1 text-xs">
                  {(() => {
                    const grouped = {}
                    history.forEach(log => {
                      const date = new Date(log.called_at).toLocaleDateString('th-TH')
                      if (!grouped[date]) grouped[date] = []
                      grouped[date].push(log)
                    })

                    return Object.entries(grouped).map(([date, logs]) => (
                      <div key={date} className="border border-warm-200 dark:border-warm-dark-300 rounded p-2 bg-white dark:bg-warm-dark-100">
                        {logs.map((log, idx) => {
                          const s = LOG_STATUS_LABEL[log.status] || { label: log.status, color: '#888', bg: '#eee' }
                          return (
                            <div key={log.id} className={idx > 0 ? 'pt-2 border-t border-warm-100 dark:border-warm-dark-300' : ''}>
                              <div className="flex items-center justify-between gap-1 mb-0.5">
                                <span className="px-1.5 py-0.5 rounded font-semibold text-xs"
                                  style={{ backgroundColor: s.bg, color: s.color }}>
                                  {s.label}
                                </span>
                                <span className="text-warm-400 dark:text-warm-dark-400 text-xs">{formatDate(log.called_at)}</span>
                              </div>
                              {log.note && (
                                <div className="text-warm-600 dark:text-warm-dark-300 text-xs leading-snug">{log.note}</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* MAIN FORM */}
          <div className="md:order-1 flex flex-col gap-4">

            {/* 2️⃣ Campaign info */}
            <div className="bg-white dark:bg-warm-dark-100 rounded-lg p-3 text-xs border border-warm-200 dark:border-warm-dark-300">
              <div className="text-warm-400 dark:text-warm-dark-400 mb-1">Campaign</div>
              <div className="font-semibold text-warm-900 dark:text-warm-50">{member.campaign_name || '—'}</div>
            </div>

            {/* 3️⃣ Status selector */}
            <div>
              <div className="text-xs font-semibold text-warm-700 dark:text-warm-200 mb-2">สถานะการโทร *</div>
              <div className="grid grid-cols-3 gap-2">
                {CALL_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`py-2 px-2 text-xs rounded-lg border transition font-medium ${
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
            </div>

            {/* 4️⃣ Note */}
            <div>
              <div className="text-xs font-semibold text-warm-700 dark:text-warm-200 mb-2">บันทึก</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="เช่น ทำงานอยู่กรุงเทพ กลับบ้านเดือนละครั้ง"
                className="w-full px-3 py-2 text-xs border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 placeholder-warm-400 dark:placeholder-warm-dark-400 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            {/* 1️⃣ RSVP — shown when answered */}
            {status === 'answered' && (
              <div>
                <div className="text-xs font-semibold text-warm-700 dark:text-warm-200 mb-2">เข้าร่วมกิจกรรมได้ไหม *</div>
                <div className="grid grid-cols-3 gap-2">
                  {RSVP_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRsvp(opt.value)}
                      className={`py-2 px-2 text-xs rounded-lg border transition font-medium ${
                        rsvp === opt.value
                          ? 'bg-teal border-teal text-white'
                          : 'border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:border-teal hover:text-teal'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5️⃣ Signals — show only when answered */}
            {showSignals && (
              <div className="bg-warm-50 dark:bg-warm-dark-200 rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-warm-700 dark:text-warm-200">Signal การติดต่อ</div>
                  {!signalsFilled && (
                    <div className="text-xs text-orange-500 font-medium">เลือกอย่างน้อย 1 ด้าน</div>
                  )}
                </div>
                {SIGNALS.map(sig => (
                  <div key={sig.key}>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-warm-700 dark:text-warm-200">{sig.label}</span>
                      <span className="text-xs text-warm-400 dark:text-warm-dark-400">{sig.hint}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
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

            {/* 6️⃣ Buttons — compact */}
            <div className="flex gap-2 pt-2 border-t border-warm-200 dark:border-warm-dark-300">
              {hasNext && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={!canSave || saving}
                  className="flex-1 py-2 bg-teal hover:opacity-90 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition"
                  title="บันทึกและไปคนต่อไป"
                >
                  {saving ? '...' : 'บันทึก & ต่อ'}
                </button>
              )}
              <button
                onClick={() => handleSave(false)}
                disabled={!canSave || saving}
                className={`py-2 text-xs font-semibold rounded-lg border transition disabled:opacity-40 ${
                  hasNext
                    ? 'px-3 border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
                    : 'flex-1 bg-teal hover:opacity-90 text-white border-teal'
                }`}
              >
                {saving ? '...' : 'บันทึก'}
              </button>
              <button
                onClick={onClose}
                className="px-3 py-2 text-xs text-warm-500 dark:text-warm-dark-500 hover:text-warm-700 dark:hover:text-warm-200 rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
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
