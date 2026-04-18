'use client'

import { useState } from 'react'

const STATUSES = [
  { value: 'answered',     label: 'รับสาย' },
  { value: 'no_answer',   label: 'ไม่รับ' },
  { value: 'wrong_number', label: 'เบอร์ผิด' },
]

const SIGNALS = {
  sig_location:    { label: 'ที่อยู่',      options: ['ต่างประเทศ', 'ต่างจังหวัด', 'ในจังหวัด', 'ในอำเภอ'] },
  sig_availability: { label: 'เวลา',        options: ['ไม่ว่างเลย', 'ไม่ค่อยว่าง', 'ว่างบ้าง', 'ว่างมาก'] },
  sig_interest:    { label: 'ความสนใจ',    options: ['ไม่สนใจ', 'สนใจนิดหน่อย', 'สนใจ', 'กระตือรือร้น'] },
  sig_reachable:   { label: 'ติดต่อได้',   options: ['ไม่ติดเลย', 'ติดยาก', 'ติดได้', 'รับสายทันที'] },
}

const GRADES = [
  { value: '1', label: 'D' },
  { value: '2', label: 'C' },
  { value: '3', label: 'B' },
  { value: '4', label: 'A' },
]

const GRADE_CLS = {
  '1': 'bg-[#fcebeb] text-[#a32d2d] dark:bg-[#3a1212] dark:text-[#d47373]',
  '2': 'bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e]',
  '3': 'bg-[#cce5f4] text-[#0c447c] dark:bg-[#0c2640] dark:text-[#7bbfec]',
  '4': 'bg-[#ead3ce] text-[#714b2b] dark:bg-[#3d2318] dark:text-[#d4a48a]',
}

export default function CallLogger({ campaignId, memberId, onLogComplete }) {
  const [status, setStatus] = useState('')
  const [signals, setSignals] = useState({
    sig_location: null, sig_availability: null, sig_interest: null, sig_reachable: null
  })
  const [sigOverall, setSigOverall] = useState('')
  const [note, setNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const isAnswered = status === 'answered'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!status) { alert('กรุณาเลือกสถานะ'); return }
    if (isAnswered && !sigOverall) { alert('กรุณาให้เกรดรวม'); return }

    setIsLoading(true)
    try {
      const res = await fetch('/api/calling/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: parseInt(campaignId),
          member_id: memberId,
          status,
          sig_overall: isAnswered ? parseInt(sigOverall) : null,
          sig_location:     isAnswered ? (signals.sig_location     != null ? parseInt(signals.sig_location)     + 1 : null) : null,
          sig_availability: isAnswered ? (signals.sig_availability != null ? parseInt(signals.sig_availability) + 1 : null) : null,
          sig_interest:     isAnswered ? (signals.sig_interest     != null ? parseInt(signals.sig_interest)     + 1 : null) : null,
          sig_reachable:    isAnswered ? (signals.sig_reachable    != null ? parseInt(signals.sig_reachable)    + 1 : null) : null,
          note: note.trim() || null
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }

      setStatus('')
      setSignals({ sig_location: null, sig_availability: null, sig_interest: null, sig_reachable: null })
      setSigOverall('')
      setNote('')
      onLogComplete?.()
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-6">
      <h3 className="text-base font-medium text-warm-900 dark:text-warm-50 mb-4">บันทึกการโทร</h3>

      {/* Status buttons */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-warm-500 dark:text-warm-dark-500 mb-2">สถานะ *</label>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition ${
                status === s.value
                  ? 'bg-teal text-white border-teal'
                  : 'bg-white dark:bg-warm-dark-200 text-warm-700 dark:text-warm-200 border-warm-200 dark:border-warm-dark-300 hover:border-teal dark:hover:border-teal'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Signals — only when answered */}
      {isAnswered && (
        <div className="mb-4 p-4 bg-warm-100 dark:bg-warm-dark-200 rounded-lg border border-warm-200 dark:border-warm-dark-300">
          <h4 className="text-xs font-medium text-warm-500 dark:text-warm-dark-500 mb-3 uppercase tracking-wide">ข้อมูลการสนทนา</h4>
          <div className="space-y-3 mb-4">
            {Object.entries(SIGNALS).map(([key, config]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-warm-700 dark:text-warm-200 mb-1">{config.label}</label>
                <select
                  value={signals[key] ?? ''}
                  onChange={e => setSignals(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full h-8 px-2 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
                >
                  <option value="">—</option>
                  {config.options.map((opt, idx) => (
                    <option key={idx} value={idx}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Grade */}
          <label className="block text-xs font-medium text-warm-700 dark:text-warm-200 mb-2">เกรดรวม *</label>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map(g => (
              <button
                key={g.value}
                type="button"
                onClick={() => setSigOverall(g.value)}
                className={`py-2 rounded-lg text-sm font-bold border transition ${
                  sigOverall === g.value
                    ? GRADE_CLS[g.value] + ' border-transparent'
                    : 'bg-white dark:bg-warm-dark-100 text-warm-500 dark:text-warm-dark-500 border-warm-200 dark:border-warm-dark-300 hover:border-teal'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-warm-500 dark:text-warm-dark-500 mb-2">หมายเหตุ</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="บันทึกเพิ่มเติม..."
          rows={3}
          className="w-full border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 placeholder-warm-400 dark:placeholder-warm-dark-400 p-2.5 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-teal resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading || !status}
        className="w-full bg-teal hover:opacity-90 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 transition"
      >
        {isLoading ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </form>
  )
}
