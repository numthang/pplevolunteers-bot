'use client'

import { useState, useRef, useEffect } from 'react'
import { Calculator, Search, X, ChevronDown } from 'lucide-react'
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
              {m.username && <span className="text-xs opacity-60">@{m.username}</span>}
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

export default function DocAutoCalc({ eventDate, eventEndDate, participantCount, isMobile: isMobileProp = false, projectBudget = null, onBudgetChange, onSubmit, saving, canCreate = true, blockReason = null }) {
  const [n, setN]                       = useState(participantCount ? String(participantCount) : '')
  const [isMobile, setIsMobile]         = useState(isMobileProp)
  const [foodEnabled, setFoodEnabled]   = useState(true)   // ค่าอาหาร (มื้อหลัก) default ติ๊ก
  const [snackEnabled, setSnackEnabled] = useState(true)   // ค่าอาหารว่าง/เบรก default ติ๊ก
  const [travelEnabled, setTravelEnabled] = useState(true) // รายการเบิก default ติ๊ก
  const [venueType, setVenueType]       = useState('normal')   // ระดับงาน: ทั่วไป/โรงแรม (คุมเรทอาหาร·เบรก·สถานที่)
  const [travelMode, setTravelMode]     = useState('lump')
  const [speakerEnabled, setSpeakerEnabled] = useState(false)
  const [speakerCount, setSpeakerCount] = useState(1)
  const [speakerHours, setSpeakerHours] = useState(1)
  const [speakerType, setSpeakerType]   = useState('general')
  const [venueEnabled, setVenueEnabled] = useState(false)
  const [venueAmount, setVenueAmount]   = useState('')     // default = เพดานตามจำนวนคน (auto-fill ตอนติ๊ก)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [showItems, setShowItems]       = useState(false)
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
    let durationHours = 0
    if (eventDate) {
      const startTime    = eventDate.split('T')[1] || '09:00'
      const startDateStr = eventDate.split('T')[0]
      // ถ้าไม่มี eventEndDate → default end = start + 4 ชม.
      let endTime, endDateStr
      if (eventEndDate) {
        endTime    = eventEndDate.split('T')[1] || '17:00'
        endDateStr = eventEndDate.split('T')[0]
      } else {
        const [sth, stm] = startTime.split(':').map(Number)
        const endMins    = sth * 60 + stm + 240  // +4 ชม.
        endTime    = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`
        endDateStr = startDateStr
      }
      const daysDiff = (new Date(endDateStr) - new Date(startDateStr)) / 86400000
      const [sh, sm] = startTime.split(':').map(Number)
      const [eh, em] = endTime.split(':').map(Number)
      durationHours  = daysDiff * 24 + ((eh * 60 + em) - (sh * 60 + sm)) / 60
      const isOvernightMiddleDay = daysDiff > 1
      const { main, snack } = calcMeals({ startTime, endTime, durationHours, isOvernightMiddleDay })
      mealMeta = { main, snack, rate: FOOD_RATES[venueType] }
    }

    function buildFoodItems(foodCount) {
      if (!mealMeta) return []
      const { main, snack, rate } = mealMeta
      const result = []
      if (foodEnabled && main.length > 0) result.push({
        itemType: 'food',
        label: `ค่าอาหาร (${main.map(m => MEAL_LABEL[m]).join('+')})`,
        description: `ค่าอาหาร${main.map(m => MEAL_LABEL[m]).join('+')} ${foodCount} คน`,
        amount: main.length * rate.main * foodCount,
        detail: `${rate.main} × ${main.length} มื้อ × ${foodCount} คน = ${(main.length * rate.main * foodCount).toLocaleString()} บ.`,
        isIndividual: false,
      })
      const snackRate = FOOD_RATES[venueType].snack
      if (snackEnabled && snack > 0) result.push({
        itemType: 'food',
        label: `ค่าอาหารว่าง (${snack} มื้อ)`,
        description: `ค่าอาหารว่าง ${snack} มื้อ × ${foodCount} คน`,
        amount: snack * snackRate * foodCount,
        detail: `${snackRate} × ${snack} มื้อ × ${foodCount} คน = ${(snack * snackRate * foodCount).toLocaleString()} บ.`,
        isIndividual: false,
      })
      return result
    }

    // คำนวณ food ด้วย count จริงก่อน (เฉพาะเมื่อติ๊กค่าอาหาร/อาหารว่าง)
    const foodItemsNatural = (foodEnabled || snackEnabled) ? buildFoodItems(count) : []
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
          overrideData: { duration: String(hrs) },
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
        overrideData: durationHours > 0 ? { duration: String(Math.round(durationHours)) } : undefined,
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

          // food — ปรับลดแต่ละรายการตามสัดส่วน ให้ผลรวม = foodShare เป๊ะ (เศษไปรายการสุดท้าย)
          if (foodShare > 0 && totalFoodNat > 0) {
            let acc = 0
            foodItems = foodItemsNatural.map((it, idx, arr) => {
              const amount = idx === arr.length - 1 ? foodShare - acc : Math.round(it.amount * foodShare / totalFoodNat)
              if (idx !== arr.length - 1) acc += amount
              return { ...it, amount, detail: `ปรับตามกรอบงบ = ${amount.toLocaleString()} บ. (จาก ${it.amount.toLocaleString()})` }
            })
          } else {
            foodItems = []
          }

          // travel (lump) — เติมส่วนที่เหลือให้เต็มงบพอดี (food+travel = available เป๊ะ)
          if (travelMode === 'lump' && travelItems.length > 0 && travelShare > 0) {
            const perHead = count > 0 ? Math.round(travelShare / count) : 0
            finalNonFood = [...fixedItems, {
              itemType:     'travel',
              label:        'ค่าเดินทาง (รวม)',
              description:  `ค่าเดินทาง ${count} คน`,
              amount:       travelShare,
              detail:       `≈ ${perHead.toLocaleString()} บ./คน × ${count} คน = ${travelShare.toLocaleString()} บ. (ปรับตามกรอบงบ)`,
              isIndividual: false,
            }]
          } else {
            finalNonFood = fixedItems
          }
        }
      }
    }

    const items = [...foodItems, ...finalNonFood]
    setProposal(items)
    setRecipients(items.map(item => item.isIndividual ? [] : null))
  }

  // แก้ยอดเงินรายการที่ระบบคำนวณมาได้เอง (manual override)
  function updateAmount(i, val) {
    const amount = val === '' ? 0 : (parseFloat(val) || 0)
    setProposal(prev => prev.map((it, j) =>
      j === i ? { ...it, amount, detail: 'แก้ยอดเอง', edited: true } : it
    ))
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

  async function handleCreate() {
    const entries = []
    for (let i = 0; i < proposal.length; i++) {
      const item = proposal[i]
      const r    = recipients[i]
      // ไม่บังคับเลือกผู้รับ — สร้างได้เลย กำหนดผู้รับทีหลังใน DocEntryList ได้ (member_discord_id nullable)
      const base = { itemType: item.itemType, description: item.description, amount: item.amount, overrideData: item.overrideData ?? undefined }
      if (item.noMember) {
        entries.push({ memberDiscordId: null, ...base })
      } else if (item.isIndividual) {
        if (r.length) {
          for (const m of r) entries.push({ memberDiscordId: m.discord_id, ...base })
        } else {
          entries.push({ memberDiscordId: null, ...base })
        }
      } else {
        entries.push({ memberDiscordId: r?.discord_id ?? null, ...base })
      }
    }
    const ok = await onSubmit(entries, parseInt(n))
    if (ok !== false) {   // สำเร็จ → ล้างรายการที่คำนวณอัตโนมัติออก
      setProposal(null)
      setRecipients([])
    }
  }

  const grandTotal = proposal
    ? proposal.reduce((s, item, i) => s + (item.isIndividual ? item.amount * (recipients[i]?.length || 0) : item.amount), 0)
    : 0

  const hasBudget = parseFloat(budget) > 0

  // เคลียร์งบไม่ได้ — เช็คจากยอดรวมปัจจุบัน (สด หลังแก้ยอดเอง) ครอบทั้งโหมดสูงสุด+ตามกรอบงบ
  // ข้ามถ้ามีค่าเดินทางจ่ายตามจริง (ยอดยังไม่รู้ กรอกระยะทางทีหลัง)
  const budgetVal2     = parseFloat(budget) || 0
  const hasDeferred    = !!proposal?.some(it => it.noMember)
  const budgetError    = (proposal && budgetVal2 > 0 && !hasDeferred && grandTotal < budgetVal2)
    ? `เคลียร์งบ ${budgetVal2.toLocaleString()} บ. ไม่ได้ — ยอดรวมตอนนี้ ${grandTotal.toLocaleString()} บ. (ขาด ${(budgetVal2 - grandTotal).toLocaleString()} บ.) เพิ่มรายการเบิก แก้ยอด หรือลดกรอบงบ`
    : null

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

      {/* ประเภทกิจกรรม */}
      <Field label="ประเภทกิจกรรม">
        <div className="space-y-2">
          <Check
            label="กิจกรรมสัญจร (ออกบูธ/ลงพื้นที่)"
            checked={isMobile}
            onChange={() => toggleMobile(!isMobile)}
          />
          <Check
            label="จัดที่โรงแรม / รีสอร์ท"
            checked={venueType === 'hotel'}
            onChange={() => setVenueType(v => v === 'hotel' ? 'normal' : 'hotel')}
          />
        </div>
      </Field>

      {/* วิธีคำนวณ — global (อยู่คู่กับกรอบงบ) */}
      <Field label="วิธีคำนวณ" hint={hasBudget ? undefined : 'ใส่กรอบงบก่อนถึงจะปรับได้ — ตอนนี้คิดตามเพดานกฎ'}>
        <select value={budgetMode} onChange={e => setBudgetMode(e.target.value)} disabled={!hasBudget} className={`${inputCls} disabled:opacity-50`}>
          <option value="budget">ตามกรอบงบ — ตัดให้พอดีงบ</option>
          <option value="max">สูงสุด — ตามเพดานกฎกองทุน</option>
        </select>
      </Field>

      {/* รายการเบิก — ติ๊กรายการไหน option ของรายการนั้นโผล่ใต้เลย */}
      <div>
        <button
          type="button"
          onClick={() => setShowItems(v => !v)}
          className="flex items-center gap-1.5 mb-2 group"
        >
          <ChevronDown size={15} className={`text-warm-400 dark:text-disc-muted transition-transform ${showItems ? '' : '-rotate-90'}`} />
          <span className={`${labelCls} group-hover:text-orange transition-colors`}>รายการเบิกเพิ่มเติม</span>
        </button>
        {showItems && <div className="space-y-2">

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

          {/* ค่าอาหาร (มื้อหลัก) — เรทตาม toggle โรงแรม ด้านบน */}
          <div>
            <Check label="ค่าอาหาร" checked={foodEnabled} onChange={() => setFoodEnabled(v => !v)} />
            {foodEnabled && (
              <p className={`${hintCls} mt-1 ml-7`}>{FOOD_RATES[venueType].main} บ./คน/มื้อ ({venueType === 'hotel' ? 'โรงแรม' : 'ทั่วไป'})</p>
            )}
          </div>

          {/* ค่าอาหารว่าง / เบรก — เรทตาม toggle โรงแรม ด้านบน */}
          <div>
            <Check label="ค่าอาหารว่าง / เบรก" checked={snackEnabled} onChange={() => setSnackEnabled(v => !v)} />
            {snackEnabled && (
              <p className={`${hintCls} mt-1 ml-7`}>{FOOD_RATES[venueType].snack} บ./คน/มื้อ ({venueType === 'hotel' ? 'โรงแรม' : 'ทั่วไป'})</p>
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

          {/* ค่าเช่าเครื่องเสียง — เบิกไม่ได้ถ้าจัดในโรงแรม */}
          <div>
            <Check label="ค่าเช่าเครื่องเสียง" checked={soundEnabled} disabled={venueType === 'hotel'} onChange={() => setSoundEnabled(v => !v)} />
            {soundEnabled && venueType !== 'hotel' && (
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

        </div>}
      </div>

      {!eventDate && (foodEnabled || snackEnabled) && (
        <p className={hintCls}>* ไม่มีข้อมูลวันเวลากิจกรรม — ค่าอาหาร/อาหารว่างจะไม่คำนวณ</p>
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
          {budgetError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              <span className="shrink-0 font-bold">⚠</span>
              <span>{budgetError}</span>
            </div>
          )}
          {proposal.map((item, i) => (
            <div key={i} className="border border-warm-200 dark:border-disc-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <span className="text-base font-medium text-warm-900 dark:text-disc-text">{item.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number" min="0" step="1"
                    value={item.amount}
                    onChange={e => updateAmount(i, e.target.value)}
                    className="w-28 border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text px-2.5 py-1.5 text-base rounded-lg text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-orange"
                  />
                  <span className="text-sm text-warm-500 dark:text-disc-muted">{item.isIndividual ? 'บ./คน' : 'บ.'}</span>
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
              disabled={saving || !!budgetError || !canCreate}
              title={blockReason || budgetError || undefined}
              className="px-6 py-2.5 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {saving ? 'กำลังสร้าง...' : !canCreate ? 'ตั้งผู้จ่ายก่อน' : budgetError ? 'เคลียร์งบไม่ได้' : `สร้างเอกสาร ${proposal.length} รายการ`}
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
