'use client'

import { useState } from 'react'

const STATUSES = [
  { value: 'answered', label: 'รับสาย' },
  { value: 'no_answer', label: 'ไม่รับสาย' },
  { value: 'busy', label: 'เบิกสาย' },
  { value: 'wrong_number', label: 'เบอร์ผิด' }
]

const SIGNALS = {
  sig_location: { label: 'ที่อยู่', options: ['ต่างประเทศ', 'ต่างจังหวัด', 'ในจังหวัด', 'ในอำเภอ'] },
  sig_availability: { label: 'เวลา', options: ['ไม่ว่างเลย', 'ไม่ค่อยว่าง', 'ว่างบ้าง', 'ว่างมาก'] },
  sig_interest: { label: 'ความสนใจ', options: ['ไม่สนใจ', 'สนใจนิดหน่อย', 'สนใจ', 'กระตือรือร้น'] },
  sig_reachable: { label: 'ติดต่อได้', options: ['ไม่ติดเลย', 'ติดยาก', 'ติดได้', 'รับสายทันที'] }
}

const selectCls = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function CallLogger({ campaignId, memberId, onLogComplete }) {
  const [status, setStatus] = useState('')
  const [signals, setSignals] = useState({
    sig_location: null,
    sig_availability: null,
    sig_interest: null,
    sig_reachable: null
  })
  const [sigOverall, setSigOverall] = useState('')
  const [note, setNote] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSignalChange = (key, value) => {
    setSignals(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!status) {
      alert('กรุณาเลือกสถานะ')
      return
    }

    if (status === 'answered' && !sigOverall) {
      alert('กรุณาให้คะแนนรวม')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/calling/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: parseInt(campaignId),
          member_id: memberId,
          status,
          sig_overall: status === 'answered' ? parseInt(sigOverall) : null,
          sig_location: status === 'answered' ? (signals.sig_location ? parseInt(signals.sig_location) + 1 : null) : null,
          sig_availability: status === 'answered' ? (signals.sig_availability ? parseInt(signals.sig_availability) + 1 : null) : null,
          sig_interest: status === 'answered' ? (signals.sig_interest ? parseInt(signals.sig_interest) + 1 : null) : null,
          sig_reachable: status === 'answered' ? (signals.sig_reachable ? parseInt(signals.sig_reachable) + 1 : null) : null,
          note: note || null
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save log')
      }

      alert('บันทึกสำเร็จ')
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

  const isAnswered = status === 'answered'

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
      <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">บันทึกการโทร</h3>

      {/* Status */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">สถานะ *</label>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => setStatus(s.value)}
              className={`p-2 rounded-lg border-2 text-sm font-semibold transition ${
                status === s.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Progressive Disclosure: Show signals only if answered */}
      {isAnswered && (
        <div className="mb-5 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
          <h4 className="font-semibold mb-3 text-gray-800 dark:text-gray-200 text-sm">ข้อมูลการสนทนา</h4>

          {/* Signals Grid */}
          <div className="grid grid-cols-1 gap-3 mb-4">
            {Object.entries(SIGNALS).map(([key, config]) => (
              <div key={key}>
                <label className="block text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">{config.label}</label>
                <select
                  value={signals[key] ?? ''}
                  onChange={(e) => handleSignalChange(key, e.target.value)}
                  className={selectCls}
                >
                  <option value="">-- เลือก --</option>
                  {config.options.map((opt, idx) => (
                    <option key={idx} value={idx}>{opt}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Overall Grade */}
          <div>
            <label className="block text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">เกรดรวม *</label>
            <div className="grid grid-cols-4 gap-2">
              {['1', '2', '3', '4'].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSigOverall(val)}
                  className={`py-2 rounded-lg font-bold text-sm transition ${
                    sigOverall === val
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {val === '1' ? 'D' : val === '2' ? 'C' : val === '3' ? 'B' : 'A'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Note */}
      <div className="mb-4">
        <label className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">หมายเหตุ</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="บันทึกเพิ่มเติม..."
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          rows="3"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading || !status}
        className="w-full bg-green-600 text-white py-2.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition"
      >
        {isLoading ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </form>
  )
}
