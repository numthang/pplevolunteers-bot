'use client'

import { useState, useRef, useEffect } from 'react'
import { Calculator, Search, X } from 'lucide-react'
import { calcMeals, FOOD_RATES, calcSpeakerCeiling, SPEAKER_RULES, calcVenueCeiling, TRAVEL_INDIVIDUAL_TIERS } from '@/config/fund69-rules.js'

const TRAVEL_IN_PROVINCE_RATE = TRAVEL_INDIVIDUAL_TIERS[0].ceiling  // ในจังหวัด 300 บ./คน

const inputCls        = 'w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text p-2.5 text-base rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange'
const compactInputCls = 'border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-2.5 py-2 text-base rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange'
// field label — อ่านชัดทั้ง light/dark (ห้ามใช้ disc-muted ที่จางหายใน dark)
const labelCls        = 'text-sm font-medium text-warm-700 dark:text-disc-text'
// hint รอง — section header / คำอธิบาย
const hintCls         = 'text-xs text-warm-500 dark:text-disc-muted'

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

// field = label บน + control เต็มกว้างล่าง (สม่ำเสมอทั้งฟอร์ม)
function Field({ label, hint, children }) {
  return (
    <div>
      <label className={`block ${labelCls} mb-1`}>{label}</label>
      {children}
      {hint && <p className={`${hintCls} mt-1`}>{hint}</p>}
    </div>
  )
}

// checkbox card — accent สีส้มเดียวทั้งฟอร์ม
function Check({ label, checked, disabled, onChange }) {
  return (
    <label
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition select-none
        ${disabled
          ? 'cursor-not-allowed border-warm-200 dark:border-disc-border opacity-40'
          : checked
            ? 'cursor-pointer border-orange bg-orange/5'
            : 'cursor-pointer border-warm-300 dark:border-disc-border hover:border-orange'}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="size-4 shrink-0 accent-orange"
      />
      <span className={`text-sm font-medium ${disabled ? 'text-warm-400 dark:text-disc-muted' : 'text-warm-700 dark:text-disc-text'}`}>
        {label}
      </span>
    </label>
  )
}

export default function DocAutoCalc({ eventDate, eventEndDate, participantCount, isMobile: isMobileProp = false, projectBudget = null, onBudgetChange, onSubmit, saving }) {
  const [n, setN]                       = useState(participantCount ? String(participantCount) : '')
  const [isMobile, setIsMobile]         = useState(isMobileProp)
  const [foodEnabled, setFoodEnabled]   = useState(true)   // รายการเบิก default ติ๊ก
  const [travelEnabled, setTravelEnabled] = useState(true) // รายการเบิก default ติ๊ก
  const [venueType, setVenueType]       = useState('normal')
  const [travelMode, setTravelMode]     = useState('lump')
  const [speakerEnabled, setSpeakerEnabled] = useState(false)
  const [speakerCount, setSpeakerCount] = useState(1)
  const [speakerHours, setSpeakerHours] = useState(1)
  const [speakerType, setSpeakerType]   = useState('general')
  const [venueEnabled, setVenueEnabled] = useState(false)
  const [venueAmount, setVenueAmount]   = useState('')     // default = เพดานตามจำนวนคน (auto-fill ตอนติ๊ก)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [soundAmount, setSoundAmount]   = useState(2000)
  const [suppliesEnabled, setSuppliesEnabled] = useState(false)
  const [suppliesAmount, setSuppliesAmount]   = useState(500)
  const [budget, setBudget]             = useState(projectBudget != null ? String(projectBudget) : '')
  const [budgetMode, setBudgetMode]     = useState('budget')  // 'max' | 'budget'
  const [proposal, setProposal]         = useState(null)
  const [recipients, setRecipients]     = useState([])

  function toggleMobile(val) {
    setIsMobile(val)
    if (val) { setSpeakerEnabled(false); setVenueEnabled(false) }
  }

  // เพดานค่าเช่าสถานที่ตามจำนวนคน (ใช้โชว์ hint + auto-fill ตอนติ๊ก)
  function venueCeiling() {
    const cnt = parseInt(n)
    return cnt > 0 ? calcVenueCeiling({ participants: cnt, isHotel: venueType === 'hotel' }) : null
  }

  function toggleVenue() {
    setVenueEnabled(v => {
      const next = !v
      if (next && venueAmount === '') {
        const c = venueCeiling()
        if (c) setVenueAmount(String(c))   // default = เพดานตามจำนวนคน
      }
      return next
    })
  }

  function calculate() {
    const count = parseInt(n)
    if (!count || count <= 0) { alert('กรุณาใส่จำนวนผู้เข้าร่วม'); return }
    const budgetVal = parseFloat(budget) || 0

    const MEAL_LABEL = { lunch: 'กลางวัน', dinner: 'เย็น' }

    // ดึงข้อมูล meal ครั้งเดียว แล้วใช้ซ้ำเมื่อต้อง scale
    let mealMeta = null
    if (eventDate) {
      const startTime    = eventDate.split('T')[1] || '09:00'
      const endTime      = (eventEndDate || eventDate).split('T')[1] || '17:00'
      const startDateStr = eventDate.split('T')[0]
      const endDateStr   = (eventEndDate || eventDate).split('T')[0]
      const daysDiff     = (new Date(endDateStr) - new Date(startDateStr)) / 86400000
      const [sh, sm]     = startTime.split(':').map(Number)
      const [eh, em]     = endTime.split(':').map(Number)
      const durationHours = daysDiff * 24 + ((eh * 60 + em) - (sh * 60 + sm)) / 60
      const isOvernightMiddleDay = daysDiff > 1
      const { main, snack } = calcMeals({ startTime, endTime, durationHours, isOvernightMiddleDay })
      mealMeta = { main, snack, rate: FOOD_RATES[venueType] }
    }

    function buildFoodItems(foodCount) {
      if (!mealMeta) return []
      const { main, snack, rate } = mealMeta
      const result = []
      if (main.length > 0) result.push({
        itemType: 'food',
        label: `ค่าอาหาร (${main.map(m => MEAL_LABEL[m]).join('+')})`,
        description: `ค่าอาหาร${main.map(m => MEAL_LABEL[m]).join('+')} ${foodCount} คน`,
        amount: main.length * rate.main * foodCount,
        detail: `${rate.main} × ${main.length} มื้อ × ${foodCount} คน = ${(main.length * rate.main * foodCount).toLocaleString()} บ.`,
        isIndividual: false,
      })
      if (snack > 0) result.push({
        itemType: 'food',
        label: `ค่าอาหารว่าง (${snack} มื้อ)`,
        description: `ค่าอาหารว่าง ${snack} มื้อ × ${foodCount} คน`,
        amount: snack * rate.snack * foodCount,
        detail: `${rate.snack} × ${snack} มื้อ × ${foodCount} คน = ${(snack * rate.snack * foodCount).toLocaleString()} บ.`,
        isIndividual: false,
      })
      return result
    }

    // คำนวณ food ด้วย count จริงก่อน (เฉพาะเมื่อติ๊กค่าอาหาร)
    const foodItemsNatural = foodEnabled ? buildFoodItems(count) : []
    const nonFoodItems = []

    if (speakerEnabled && !isMobile) {
      const cnt    = Math.min(Math.max(1, parseInt(speakerCount) || 1), SPEAKER_RULES.maxPerEvent)
      const hrs    = parseFloat(speakerHours) || 1
      const hFloor = Math.floor(hrs)
      const mins   = Math.round((hrs - hFloor) * 60)
      const rate   = SPEAKER_RULES.rates[speakerType]
      const amount = calcSpeakerCeiling({ hours: hFloor, minutes: mins, isGovOfficer: speakerType === 'government' })
      const typeLabel = speakerType === 'government' ? 'ข้าราชการ' : 'บุคคลทั่วไป'
      for (let i = 0; i < cnt; i++) {
        nonFoodItems.push({
          itemType:     'speaker',
          label:        `ค่าวิทยากร (คนที่ ${i + 1})`,
          description:  `ค่าตอบแทนวิทยากร (${typeLabel})`,
          amount,
          detail:       `${rate.toLocaleString()} บ./ชม. × ${hrs} ชม. = ${amount.toLocaleString()} บ.`,
          isIndividual: false,
        })
      }
    }

    if (venueEnabled && !isMobile) {
      const ceiling = calcVenueCeiling({ participants: count, isHotel: venueType === 'hotel' })
      const amount  = parseFloat(venueAmount) || ceiling || 0  // กรอกเอง > เพดานตามคน
      nonFoodItems.push({
        itemType:     'venue',
        label:        'ค่าเช่าสถานที่',
        description:  'ค่าเช่าสถานที่จัดกิจกรรม',
        amount,
        detail:       ceiling ? `เพดานตามจำนวนคน ${ceiling.toLocaleString()} บ.` : 'ตามจริง',
        isIndividual: false,
      })
    }

    if (soundEnabled) {
      const amount = parseFloat(soundAmount) || 0
      nonFoodItems.push({
        itemType:     'sound',
        label:        'ค่าเช่าเครื่องเสียง',
        description:  'ค่าเช่าเครื่องเสียงสำหรับกิจกรรม',
        amount,
        detail:       amount ? `${amount.toLocaleString()} บ.` : 'กรุณาระบุยอด',
        isIndividual: false,
      })
    }

    if (suppliesEnabled) {
      const amount = parseFloat(suppliesAmount) || 0
      nonFoodItems.push({
        itemType:     'supplies',
        label:        'ค่าอุปกรณ์',
        description:  'ค่าอุปกรณ์สำหรับกิจกรรม',
        amount,
        detail:       amount ? `${amount.toLocaleString()} บ.` : 'กรุณาระบุยอด',
        isIndividual: false,
      })
    }

    if (travelEnabled) {
      if (travelMode === 'lump') {
        // เท่ากันทุกคน — ในจังหวัด 300 บ./คน รวมใบเดียว
        const rate = TRAVEL_IN_PROVINCE_RATE
        nonFoodItems.push({
          itemType:     'travel',
          label:        'ค่าเดินทาง (รวม)',
          description:  `ค่าเดินทาง ${count} คน`,
          amount:       rate * count,
          detail:       `${rate} × ${count} คน = ${(rate * count).toLocaleString()} บ.`,
          isIndividual: false,
        })
      } else {
        // จ่ายตามจริง — สร้างใบเปล่า ยอด 0 → กรอกระยะทาง+ผู้รับทีละคนใน DocEntryList (ระบบคิด rate ให้)
        for (let i = 0; i < count; i++) {
          nonFoodItems.push({
            itemType:     'travel',
            label:        'ค่าเดินทาง',
            description:  'ค่าเดินทาง',
            amount:       0,
            detail:       'กรอกระยะทาง + ผู้รับทีหลัง (ระบบคิดเงินให้)',
            isIndividual: false,
            noMember:     true,
          })
        }
      }
    }

    // budget mode
    let foodItems = foodItemsNatural
    let finalNonFood = nonFoodItems

    if (budgetMode === 'budget' && budgetVal > 0) {
      const totalFoodNat  = foodItemsNatural.reduce((s, i) => s + i.amount, 0)
      const foodPerPerson = count > 0 ? totalFoodNat / count : 0

      // แยก travel (ตัดได้) ออกจาก fixed items
      const fixedItems   = nonFoodItems.filter(i => i.itemType !== 'travel')
      const travelItems  = nonFoodItems.filter(i => i.itemType === 'travel')
      const totalFixed   = fixedItems.reduce((s, i) => s + i.amount, 0)
      const totalTravel  = travelItems.reduce((s, i) => s + i.amount, 0)
      const total        = totalFoodNat + totalFixed + totalTravel

      if (total > budgetVal) {
        // แบ่ง available (หลังหัก fixed) ระหว่าง food + travel ตามสัดส่วน natural
        const available         = Math.max(0, budgetVal - totalFixed)
        const naturalFoodTravel = totalFoodNat + totalTravel

        if (available === 0 || naturalFoodTravel === 0) {
          foodItems   = []
          finalNonFood = fixedItems
        } else {
          const foodShare   = Math.round(available * totalFoodNat / naturalFoodTravel)
          const travelShare = available - foodShare

          // food
          const perHeadFood = count > 0 ? Math.ceil(foodShare / count / 10) * 10 : 0
          foodItems = perHeadFood > 0 ? [{
            itemType:    'food',
            label:       'ค่าอาหาร',
            description: 'ค่าอาหาร (เฉลี่ย)',
            amount:      perHeadFood * count,
            detail:      `${perHeadFood.toLocaleString()} บ./คน × ${count} คน = ${(perHeadFood * count).toLocaleString()} บ. (ปรับตามกรอบงบ)`,
          }] : []

          // travel (lump mode เท่านั้น)
          if (travelMode === 'lump' && travelItems.length > 0) {
            const perHeadTravel = count > 0 ? Math.ceil(travelShare / count / 10) * 10 : 0
            finalNonFood = [
              ...fixedItems,
              ...(perHeadTravel > 0 ? [{
                itemType:     'travel',
                label:        'ค่าเดินทาง (รวม)',
                description:  `ค่าเดินทาง ${count} คน`,
                amount:       perHeadTravel * count,
                detail:       `${perHeadTravel.toLocaleString()} บ./คน × ${count} คน = ${(perHeadTravel * count).toLocaleString()} บ. (ปรับตามกรอบงบ)`,
                isIndividual: false,
              }] : []),
            ]
          }
        }
      } else if (total < budgetVal && mealMeta && foodPerPerson > 0) {
        // ยอดต่ำกว่างบ → scale food ขึ้น
        const neededCount = Math.ceil((budgetVal - totalFixed - totalTravel) / foodPerPerson)
        if (neededCount > count) foodItems = buildFoodItems(neededCount)
      }
    }

    const items = [...foodItems, ...finalNonFood]
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
      // ไม่บังคับเลือกผู้รับ — สร้างได้เลย กำหนดผู้รับทีหลังใน DocEntryList ได้ (member_discord_id nullable)
      if (item.noMember) {
        entries.push({ memberDiscordId: null, itemType: item.itemType, description: item.description, amount: item.amount })
      } else if (item.isIndividual) {
        if (r.length) {
          for (const m of r) entries.push({ memberDiscordId: m.discord_id, itemType: item.itemType, description: item.description, amount: item.amount })
        } else {
          entries.push({ memberDiscordId: null, itemType: item.itemType, description: item.description, amount: item.amount })
        }
      } else {
        entries.push({ memberDiscordId: r?.discord_id ?? null, itemType: item.itemType, description: item.description, amount: item.amount })
      }
    }
    onSubmit(entries, parseInt(n))
  }

  const grandTotal = proposal
    ? proposal.reduce((s, item, i) => s + (item.isIndividual ? item.amount * (recipients[i]?.length || 0) : item.amount), 0)
    : 0

  const hasBudget = parseFloat(budget) > 0

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 mb-6 space-y-4">

      {/* จำนวนคน + กรอบงบ */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="จำนวนคน">
          <input
            type="number" min="1" value={n} onChange={e => setN(e.target.value)}
            placeholder="50" className={inputCls}
          />
        </Field>
        <Field label="กรอบงบ (บาท)" hint={projectBudget != null ? 'จากกรอบงบโครงการ · แก้ได้ (บันทึกตอนออกจากช่อง)' : undefined}>
          <input
            type="number" min="0" step="100" value={budget}
            onChange={e => setBudget(e.target.value)}
            onBlur={() => { if (onBudgetChange) onBudgetChange(budget === '' ? null : parseFloat(budget)) }}
            placeholder="ไม่ระบุ = ตามเพดาน" className={inputCls}
          />
        </Field>
      </div>

      {/* วิธีคำนวณ — global (อยู่คู่กับกรอบงบ) */}
      <Field label="วิธีคำนวณ" hint={hasBudget ? undefined : 'ใส่กรอบงบก่อนถึงจะปรับได้ — ตอนนี้คิดตามเพดานกฎ'}>
        <select value={budgetMode} onChange={e => setBudgetMode(e.target.value)} disabled={!hasBudget} className={`${inputCls} disabled:opacity-50`}>
          <option value="budget">ตามกรอบงบ — ตัดให้พอดีงบ</option>
          <option value="max">สูงสุด — ตามเพดานกฎกองทุน</option>
        </select>
      </Field>

      {/* ประเภทกิจกรรม */}
      <Field label="ประเภทกิจกรรม">
        <Check
          label="กิจกรรมสัญจร (ออกบูธ/ลงพื้นที่ — ตัดค่าวิทยากร/สถานที่)"
          checked={isMobile}
          onChange={() => toggleMobile(!isMobile)}
        />
      </Field>

      {/* รายการเบิก — ติ๊กรายการไหน option ของรายการนั้นโผล่ใต้เลย */}
      <div>
        <p className={`${labelCls} mb-2`}>รายการเบิก</p>
        <div className="space-y-2">

          {/* ค่าอาหาร */}
          <div>
            <Check label="ค่าอาหาร" checked={foodEnabled} onChange={() => setFoodEnabled(v => !v)} />
            {foodEnabled && (
              <div className="mt-2 ml-7">
                <select value={venueType} onChange={e => setVenueType(e.target.value)} className={inputCls}>
                  <option value="normal">ทั่วไป — {FOOD_RATES.normal.main}/{FOOD_RATES.normal.snack} บาท/คน/มื้อ</option>
                  <option value="hotel">โรงแรม — {FOOD_RATES.hotel.main}/{FOOD_RATES.hotel.snack} บาท/คน/มื้อ</option>
                </select>
              </div>
            )}
          </div>

          {/* ค่าเดินทาง */}
          <div>
            <Check label="ค่าเดินทาง" checked={travelEnabled} onChange={() => setTravelEnabled(v => !v)} />
            {travelEnabled && (
              <div className="mt-2 ml-7">
                <select value={travelMode} onChange={e => setTravelMode(e.target.value)} className={inputCls}>
                  <option value="lump">เท่ากันทุกคน — ในจังหวัด {TRAVEL_IN_PROVINCE_RATE} บ./คน (ใบเดียว)</option>
                  <option value="individual">จ่ายตามจริง — แยกรายบุคคล (กรอกระยะทางทีหลัง)</option>
                </select>
                {travelMode === 'individual' && (
                  <p className={`${hintCls} mt-1`}>สร้างใบเปล่าแยกรายคน → กรอกระยะทาง+ผู้รับทีละคนในรายการ ระบบคิดเงินให้</p>
                )}
              </div>
            )}
          </div>

          {/* ค่าวิทยากร */}
          <div>
            <Check label="ค่าวิทยากร" checked={speakerEnabled} disabled={isMobile} onChange={() => setSpeakerEnabled(v => !v)} />
            {speakerEnabled && !isMobile && (
              <div className="mt-2 ml-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label={`จำนวน (สูงสุด ${SPEAKER_RULES.maxPerEvent})`}>
                  <input type="number" min="1" max={SPEAKER_RULES.maxPerEvent} value={speakerCount} onChange={e => setSpeakerCount(e.target.value)} className={inputCls} />
                </Field>
                <Field label="ชั่วโมง/คน">
                  <input type="number" min="0.5" step="0.5" value={speakerHours} onChange={e => setSpeakerHours(e.target.value)} className={inputCls} />
                </Field>
                <Field label="ประเภท">
                  <select value={speakerType} onChange={e => setSpeakerType(e.target.value)} className={inputCls}>
                    <option value="general">ทั่วไป ({SPEAKER_RULES.rates.general.toLocaleString()} บ./ชม.)</option>
                    <option value="government">ข้าราชการ ({SPEAKER_RULES.rates.government.toLocaleString()} บ./ชม.)</option>
                  </select>
                </Field>
              </div>
            )}
          </div>

          {/* ค่าเช่าสถานที่ */}
          <div>
            <Check label="ค่าเช่าสถานที่" checked={venueEnabled} disabled={isMobile} onChange={toggleVenue} />
            {venueEnabled && !isMobile && (
              <div className="mt-2 ml-7">
                <input
                  type="number" min="0" step="100" value={venueAmount}
                  onChange={e => setVenueAmount(e.target.value)}
                  placeholder={venueCeiling() ? String(venueCeiling()) : 'ยอดเงิน'}
                  className={inputCls}
                />
                <p className={`${hintCls} mt-1`}>
                  {venueCeiling() ? `เพดานตามจำนวนคน ${venueCeiling().toLocaleString()} บ. (ปล่อยว่าง = ใช้เพดาน)` : 'กรอกจำนวนคนเพื่อดูเพดาน'}
                </p>
              </div>
            )}
          </div>

          {/* ค่าเช่าเครื่องเสียง */}
          <div>
            <Check label="ค่าเช่าเครื่องเสียง" checked={soundEnabled} onChange={() => setSoundEnabled(v => !v)} />
            {soundEnabled && (
              <div className="mt-2 ml-7">
                <input type="number" min="0" step="100" value={soundAmount} onChange={e => setSoundAmount(e.target.value)} placeholder="ยอดเงิน" className={inputCls} />
              </div>
            )}
          </div>

          {/* ค่าอุปกรณ์ */}
          <div>
            <Check label="ค่าอุปกรณ์" checked={suppliesEnabled} onChange={() => setSuppliesEnabled(v => !v)} />
            {suppliesEnabled && (
              <div className="mt-2 ml-7">
                <input type="number" min="0" step="100" value={suppliesAmount} onChange={e => setSuppliesAmount(e.target.value)} placeholder="ยอดเงิน" className={inputCls} />
              </div>
            )}
          </div>

        </div>
      </div>

      {!eventDate && foodEnabled && (
        <p className={hintCls}>* ไม่มีข้อมูลวันเวลากิจกรรม — ค่าอาหารจะไม่คำนวณ</p>
      )}

      <button
        type="button"
        onClick={calculate}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light transition"
      >
        <Calculator size={16} /> คำนวณ
      </button>

      {proposal && (
        <div className="mt-5 space-y-3">
          {proposal.map((item, i) => (
            <div key={i} className="border border-warm-200 dark:border-disc-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <span className="text-base font-medium text-warm-900 dark:text-disc-text">{item.label}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-base font-bold text-warm-900 dark:text-disc-text tabular-nums">
                    {item.isIndividual ? `${item.amount.toLocaleString()} บ./คน` : `${item.amount.toLocaleString()} บ.`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setProposal(p => p.filter((_, j) => j !== i))
                      setRecipients(r => r.filter((_, j) => j !== i))
                    }}
                    className="text-warm-300 hover:text-red-500 dark:text-disc-muted dark:hover:text-red-400 transition"
                  >
                    <X size={15} />
                  </button>
                </div>
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
              {saving ? 'กำลังสร้าง...' : 'สร้างรายการ'}
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
