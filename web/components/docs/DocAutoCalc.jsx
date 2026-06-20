'use client'

import { useState, useRef, useEffect } from 'react'
import { Calculator, Search, X } from 'lucide-react'
import { calcMeals, FOOD_RATES } from '@/config/fund69-rules.js'

const inputCls = 'w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text p-2.5 text-base rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange'

function MemberSearch({ selected, multi, onSelect, onRemove }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const dropRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/docs/members?q=${encodeURIComponent(query)}&limit=20`)
      const d = await r.json()
      setResults(d.data || [])
      setOpen(true)
    }, 300)
  }, [query])

  function pick(m) { onSelect(m); setQuery(''); setResults([]); setOpen(false) }

  const arr = multi ? (selected || []) : (selected ? [selected] : [])

  return (
    <div>
      {arr.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {arr.map(m => (
            <span key={m.discord_id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange/10 text-orange text-sm rounded-full">
              {m.display_name}
              <button type="button" onClick={() => onRemove(m.discord_id)} className="hover:text-red-500 transition"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {(multi || arr.length === 0) && (
        <div className="relative" ref={dropRef}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={multi ? 'เพิ่มผู้รับ...' : 'ค้นชื่อผู้รับ...'}
            className="w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text pl-8 pr-3 py-2 text-sm rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange"
          />
          {open && results.length > 0 && (
            <ul className="absolute z-20 w-full mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map(m => (
                <li key={m.discord_id}>
                  <button type="button" onClick={() => pick(m)} className="w-full text-left px-3 py-2 hover:bg-warm-50 dark:hover:bg-disc-hover text-sm transition">
                    <span className="font-medium text-warm-900 dark:text-disc-text">{m.display_name}</span>
                    {m.username && <span className="ml-1.5 text-xs text-warm-400 dark:text-disc-muted">@{m.username}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function DocAutoCalc({ eventDate, eventEndDate, participantCount, onSubmit, saving }) {
  const [n, setN]                   = useState(participantCount ? String(participantCount) : '')
  const [venueType, setVenueType]   = useState('normal')
  const [travelMode, setTravelMode] = useState('lump')
  const [travelRate, setTravelRate] = useState(300)
  const [proposal, setProposal]     = useState(null)
  const [recipients, setRecipients] = useState([])  // parallel array to proposal

  function calculate() {
    const count = parseInt(n)
    if (!count || count <= 0) { alert('กรุณาใส่จำนวนผู้เข้าร่วม'); return }

    const items = []

    if (eventDate) {
      const startTime    = eventDate.split('T')[1] || '09:00'
      const endTime      = (eventEndDate || eventDate).split('T')[1] || '17:00'
      const startDateStr = eventDate.split('T')[0]
      const endDateStr   = (eventEndDate || eventDate).split('T')[0]
      const [sh, sm]     = startTime.split(':').map(Number)
      const [eh, em]     = endTime.split(':').map(Number)
      const daysDiff     = (new Date(endDateStr) - new Date(startDateStr)) / 86400000
      const durationHours = daysDiff * 24 + ((eh * 60 + em) - (sh * 60 + sm)) / 60
      const isOvernightMiddleDay = daysDiff > 1

      const { main, snack } = calcMeals({ startTime, endTime, durationHours, isOvernightMiddleDay })
      const rate = FOOD_RATES[venueType]
      const MEAL_LABEL = { lunch: 'กลางวัน', dinner: 'เย็น' }

      if (main.length > 0) {
        items.push({
          itemType:     'food',
          label:        `ค่าอาหาร (${main.map(m => MEAL_LABEL[m]).join('+')})`,
          description:  `ค่าอาหาร${main.map(m => MEAL_LABEL[m]).join('+')} ${count} คน`,
          amount:       main.length * rate.main * count,
          detail:       `${rate.main} × ${main.length} มื้อ × ${count} คน = ${(main.length * rate.main * count).toLocaleString()} บ.`,
          isIndividual: false,
        })
      }
      if (snack > 0) {
        items.push({
          itemType:     'food',
          label:        `ค่าอาหารว่าง (${snack} มื้อ)`,
          description:  `ค่าอาหารว่าง ${snack} มื้อ × ${count} คน`,
          amount:       snack * rate.snack * count,
          detail:       `${rate.snack} × ${snack} มื้อ × ${count} คน = ${(snack * rate.snack * count).toLocaleString()} บ.`,
          isIndividual: false,
        })
      }
    }

    if (travelMode === 'lump') {
      items.push({
        itemType:     'travel',
        label:        'ค่าเดินทาง (รวม)',
        description:  `ค่าเดินทาง ${count} คน`,
        amount:       travelRate * count,
        detail:       `${travelRate} × ${count} คน = ${(travelRate * count).toLocaleString()} บ.`,
        isIndividual: false,
      })
    } else {
      items.push({
        itemType:     'travel',
        label:        'ค่าเดินทาง (รายบุคคล)',
        description:  'ค่าเดินทาง',
        amount:       travelRate,
        detail:       `${travelRate} บ./คน — เพิ่มผู้รับทีละคน`,
        isIndividual: true,
      })
    }

    setProposal(items)
    setRecipients(items.map(item => item.isIndividual ? [] : null))
  }

  function pickRecipient(i, m) {
    setRecipients(prev => {
      const next = [...prev]
      if (proposal[i].isIndividual) {
        if (!next[i].find(x => x.discord_id === m.discord_id)) next[i] = [...next[i], m]
      } else {
        next[i] = m
      }
      return next
    })
  }

  function removeRecipient(i, discordId) {
    setRecipients(prev => {
      const next = [...prev]
      if (proposal[i].isIndividual) next[i] = next[i].filter(x => x.discord_id !== discordId)
      else next[i] = null
      return next
    })
  }

  function handleCreate() {
    const entries = []
    for (let i = 0; i < proposal.length; i++) {
      const item = proposal[i]
      const r    = recipients[i]
      if (item.isIndividual) {
        if (!r.length) { alert(`กรุณาเพิ่มผู้รับสำหรับ "${item.label}"`); return }
        for (const m of r) entries.push({ memberDiscordId: m.discord_id, itemType: item.itemType, description: item.description, amount: item.amount })
      } else {
        if (!r) { alert(`กรุณาเลือกผู้รับสำหรับ "${item.label}"`); return }
        entries.push({ memberDiscordId: r.discord_id, itemType: item.itemType, description: item.description, amount: item.amount })
      }
    }
    onSubmit(entries, parseInt(n))
  }

  const grandTotal = proposal
    ? proposal.reduce((s, item, i) => s + (item.isIndividual ? item.amount * (recipients[i]?.length || 0) : item.amount), 0)
    : 0

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={18} className="text-orange shrink-0" />
        <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">คำนวณอัตโนมัติ</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs text-warm-500 dark:text-disc-muted mb-1">จำนวนผู้เข้าร่วม</label>
          <input type="number" min="1" value={n} onChange={e => setN(e.target.value)} placeholder="เช่น 50" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-warm-500 dark:text-disc-muted mb-1">ประเภทสถานที่</label>
          <select value={venueType} onChange={e => setVenueType(e.target.value)} className={inputCls}>
            <option value="normal">ทั่วไป (300 / 50 บ.)</option>
            <option value="hotel">โรงแรม (400 / 100 บ.)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-warm-500 dark:text-disc-muted mb-1">ค่าเดินทาง</label>
          <select value={travelMode} onChange={e => setTravelMode(e.target.value)} className={inputCls}>
            <option value="lump">รวมใบเดียว</option>
            <option value="individual">รายบุคคล</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-warm-500 dark:text-disc-muted mb-1">อัตราเดินทาง (บ./คน)</label>
          <input type="number" min="0" value={travelRate} onChange={e => setTravelRate(Number(e.target.value))} className={inputCls} />
        </div>
      </div>

      {!eventDate && (
        <p className="text-xs text-warm-400 dark:text-disc-muted mb-3">* ไม่มีข้อมูลวันเวลากิจกรรม — ค่าอาหารจะไม่คำนวณ</p>
      )}

      <button
        type="button"
        onClick={calculate}
        className="flex items-center gap-2 px-4 py-2 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light transition"
      >
        <Calculator size={15} /> คำนวณ
      </button>

      {proposal && (
        <div className="mt-5 space-y-3">
          {proposal.map((item, i) => (
            <div key={i} className="border border-warm-200 dark:border-disc-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <span className="text-base font-medium text-warm-900 dark:text-disc-text">{item.label}</span>
                <span className="text-base font-bold text-warm-900 dark:text-disc-text shrink-0 tabular-nums">
                  {item.isIndividual ? `${item.amount.toLocaleString()} บ./คน` : `${item.amount.toLocaleString()} บ.`}
                </span>
              </div>
              <p className="text-xs text-warm-500 dark:text-disc-muted mb-3">{item.detail}</p>
              <MemberSearch
                selected={recipients[i]}
                multi={item.isIndividual}
                onSelect={m => pickRecipient(i, m)}
                onRemove={id => removeRecipient(i, id)}
              />
            </div>
          ))}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="px-6 py-2.5 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light disabled:opacity-50 transition"
            >
              {saving ? 'กำลังสร้าง...' : 'สร้างใบสำคัญ'}
            </button>
            {grandTotal > 0 && (
              <div className="text-right">
                <div className="text-xs text-warm-500 dark:text-disc-muted">ยอดรวม</div>
                <div className="text-lg font-bold text-warm-900 dark:text-disc-text tabular-nums">{grandTotal.toLocaleString()} บ.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
