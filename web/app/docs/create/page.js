'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Search, X } from 'lucide-react'

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [datePart, timePart] = dateStr.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  let r = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
  if (timePart && timePart !== '00:00') r += ` ${timePart} น.`
  return r
}

const inputCls = 'w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange'

export default function CreateDocProjectPage() {
  const router = useRouter()
  const { data: session } = useSession()

  const [query, setQuery]         = useState('')
  const [events, setEvents]       = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const [projectName, setProjectName]      = useState('')
  const [isMobile, setIsMobile]           = useState(false)
  const [participantCount, setParticipantCount] = useState('')
  const [budget, setBudget]               = useState('')
  const [loading, setLoading]             = useState(false)

  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) { setEvents([]); setShowDropdown(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/events?q=${encodeURIComponent(query)}&limit=20`)
        const data = await res.json()
        setEvents(data.data || [])
        setShowDropdown(true)
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [query])

  function selectEvent(ev) {
    setSelected(ev)
    setQuery(ev.name)
    setShowDropdown(false)
  }

  function clearEvent() {
    setSelected(null)
    setQuery('')
    setEvents([])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selected) { alert('กรุณาเลือกกิจกรรมก่อน'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/docs/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actEventCacheId: selected.id,
          projectName: projectName.trim() || null,
          isMobile,
          participantCount: participantCount ? parseInt(participantCount) : null,
          budget: budget ? parseFloat(budget) : null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create project')
      }
      const { data } = await res.json()
      router.push(`/docs/${data.id}/setup`)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Link href="/docs" className="text-teal hover:underline mb-6 block text-base">
        ← กลับ
      </Link>

      <div className="max-w-2xl bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-6 text-warm-900 dark:text-disc-text">สร้างโครงการเอกสาร</h1>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Event Search */}
          <div>
            <label className="block text-base font-semibold mb-1.5 text-warm-700 dark:text-disc-text">
              กิจกรรม *
            </label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted pointer-events-none" />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelected(null) }}
                  placeholder="ค้นหาชื่อกิจกรรม..."
                  className={`${inputCls} pl-9 pr-8`}
                />
                {(query || selected) && (
                  <button type="button" onClick={clearEvent} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 dark:text-disc-muted dark:hover:text-disc-text">
                    <X size={16} />
                  </button>
                )}
              </div>

              {showDropdown && events.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {events.map(ev => (
                    <li key={ev.id}>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-3 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                        onClick={() => selectEvent(ev)}
                      >
                        <div className="text-base font-medium text-warm-900 dark:text-disc-text">{ev.name}</div>
                        <div className="text-sm text-warm-500 dark:text-disc-muted">
                          {ev.province && <span>{ev.province} · </span>}
                          {formatDate(ev.event_date)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {showDropdown && !searching && events.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg px-4 py-3 text-base text-warm-500 dark:text-disc-muted">
                  ไม่พบกิจกรรม
                </div>
              )}
            </div>

            {selected && (
              <div className="mt-2 p-3 rounded-lg bg-warm-50 dark:bg-disc-hover border border-warm-200 dark:border-disc-border text-sm text-warm-700 dark:text-disc-muted">
                <span className="font-medium text-warm-900 dark:text-disc-text">{selected.name}</span>
                {selected.event_date && <span className="ml-2">{formatDate(selected.event_date)}{selected.event_end_date ? ` – ${formatDate(selected.event_end_date)}` : ''}</span>}
                {selected.province && <span className="ml-2 text-xs">· {selected.province}</span>}
              </div>
            )}
          </div>

          {/* project_name */}
          <div>
            <label className="block text-base font-semibold mb-1.5 text-warm-700 dark:text-disc-text">
              ชื่อโครงการใหญ่
            </label>
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="เช่น การจัดประชุมสมาชิกสัมพันธ์และผู้สนับสนุนพรรคทั่วประเทศ ปี 2569"
              className={inputCls}
            />
          </div>

          {/* is_mobile toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-warm-200 dark:border-disc-border">
            <div>
              <div className="text-base font-semibold text-warm-900 dark:text-disc-text">กิจกรรมสัญจร</div>
              <div className="text-sm text-warm-500 dark:text-disc-muted">ออกบูธ / ลงพื้นที่ — ไม่สามารถเบิกค่าวิทยากร / ค่าสถานที่</div>
            </div>
            <button
              type="button"
              onClick={() => setIsMobile(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${isMobile ? 'bg-orange' : 'bg-warm-300 dark:bg-disc-border'}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${isMobile ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Numbers */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-base font-semibold mb-1.5 text-warm-700 dark:text-disc-text">จำนวนผู้เข้าร่วม</label>
              <input
                type="number" min="1" value={participantCount}
                onChange={e => setParticipantCount(e.target.value)}
                placeholder="เช่น 50"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-base font-semibold mb-1.5 text-warm-700 dark:text-disc-text">งบประมาณ (บาท)</label>
              <input
                type="number" min="0" step="0.01" value={budget}
                onChange={e => setBudget(e.target.value)}
                placeholder="เช่น 25000"
                className={inputCls}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !selected}
            className="w-full bg-orange text-white py-3 rounded-lg text-base font-semibold hover:bg-orange-light disabled:opacity-50 transition"
          >
            {loading ? 'กำลังสร้าง...' : 'สร้างโครงการ →'}
          </button>
        </form>
      </div>
    </div>
  )
}
