'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { suggestMeals, makeableMenus } from '@/lib/cookingMatch.js'
import MenuForm from './MenuForm.jsx'

// แทน 🛒 emoji — emoji เป็น full-color glyph ของระบบ แก้สีผ่าน CSS ไม่ได้ ใช้ currentColor แทนให้เข้ากับสีรอบๆ เอง
function CartIcon({ className = 'w-4 h-4 inline-block align-[-2px]' }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 3h2l1.6 9.6a1.6 1.6 0 0 0 1.6 1.4h6.6a1.6 1.6 0 0 0 1.6-1.3L17 6H5" />
      <circle cx="8" cy="17" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// normalize for client-side dedup: strip spaces/case before comparing
const norm = s => s.trim().toLowerCase().replace(/\s+/g, '')

function findDuplicate(input, existing) {
  const n = norm(input)
  for (const c of existing) {
    const nt = norm(c.token)
    const nl = norm(c.label || c.token)
    // เทียบเท่ากันตรงๆ เท่านั้น — ห้ามเช็ค substring/containment: คำไทยผสมคำกันได้ตามปกติ
    // (เช่น "ไข่ไก่" contains "ไก่", "ไข่เค็ม" contains "ไข่") ถือว่าซ้ำผิดๆ ถ้าเช็คแบบ containment
    if (n === nt || n === nl) return c
  }
  return null
}

// 5 หมวด — เคาะกับ user 2026-07-10 (เลิกใช้ "ของเฉพาะ" เป็นถังรวมสารพัด)
const GROUP_OPTIONS = [
  { value: 'protein', label: 'โปรตีน' },
  { value: 'veg', label: 'ผักและผลไม้' },
  { value: 'starch', label: 'แป้งและธัญพืช' },
  { value: 'dairy', label: 'ไขมันและนม' },
  { value: 'seasoning', label: 'เครื่องปรุงและสมุนไพร' },
]

const CHIP_BASE =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-base border transition'
// 3 สถานะ สี pastel ต่างกันชัด: มี=เขียวอ่อน · หมด=ชมพูอ่อน(เตือน) · ยังไม่ติ๊ก=เทาโปร่งเส้นประ
const CHIP_NEUTRAL =
  'border-dashed border-warm-300 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
// สีจากคลังพาสเทลของ user: มี = ชุด "เขียว" (#AAD9CE) · หมด = ชุด "ชมพูอ่อน" (#E688A1)
const CHIP_HAVE = 'border-transparent bg-[#AAD9CE] text-[#1f4a3d]'
const CHIP_OUT = 'border-transparent bg-[#E688A1] text-[#4a1f2e]'

// สล็อต reel: ความสูงต่อช่อง (ต้องตรงกับ h-32 = 8rem = 128px ของแต่ละแถวใน reel)
const REEL_ITEM_HEIGHT = 128
// จำนวนช่องใน strip — ยิ่งเยอะยิ่งดูหมุนไว ก่อนไป landing ที่ช่องสุดท้าย
const REEL_ITEM_COUNT = 24
// รวมเวลาหมุน (ms) — ต้อง sync กับ transition duration ด้านล่างเป๊ะๆ
const REEL_SPIN_MS = 1900

function nextStatus(current) {
  if (current === 'have') return 'out'
  if (current === 'out') return 'clear'
  return 'have'
}

// แตะเพื่อสลับสถานะเท่านั้น — แก้ไข/ลบ ย้ายไปหน้า /cooking/ingredients แล้ว (2026-07-11)
function Chip({ token, label, status, onCycle }) {
  const cls =
    status === 'have' ? CHIP_HAVE : status === 'out' ? CHIP_OUT : CHIP_NEUTRAL
  return (
    <button
      type="button"
      onClick={() => onCycle(token)}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-base border transition ${cls}`}
    >
      {status === 'have' && <span>✓</span>}
      {status === 'out' && <CartIcon />}
      <span>{label}</span>
    </button>
  )
}

// จัดหมวดด้วย AI แทนให้ผู้ใช้เลือกเอง (2026-07-11) — แก้หมวดทีหลังได้ที่ /cooking/ingredients
function AddIngredientRow({ onAdd, onBulkPreview }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setText('')
  }

  async function submit() {
    if (!text.trim() || busy) return
    setBusy(true)
    setMsg(null)

    if (text.includes(',')) {
      const { error } = await onBulkPreview(text)
      setBusy(false)
      if (error) setMsg(error)
      else reset()
      return
    }

    const { error } = await onAdd(text)
    setBusy(false)
    if (error) {
      setMsg(error)
    } else {
      reset()
      setMsg('เพิ่มแล้ว')
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-warm-200 dark:border-disc-border">
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="เพิ่มของในครัว เช่น ผักหวานบ้าน หรือคั่นด้วย , ใส่หลายอย่างพร้อมกัน"
          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-sm placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal transition"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
        >
          {busy ? '...' : text.includes(',') ? 'แยกรายการ' : 'เพิ่ม'}
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-warm-500 dark:text-disc-muted">{msg}</p>}
    </div>
  )
}

function ChipGroup({ heading, items, pantry, onCycle }) {
  const regular = items.filter(i => i.tier !== 'occasional')
  const occasional = items.filter(i => i.tier === 'occasional')
  const renderItem = i => (
    <Chip
      key={i.token}
      token={i.token}
      label={i.label || i.token}
      status={pantry[i.token]}
      onCycle={onCycle}
    />
  )
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-sm font-medium text-warm-500 dark:text-disc-muted mb-2">{heading}</p>
      <div className="flex flex-wrap gap-2">
        {regular.map(renderItem)}
        {occasional.length > 0 && (
          <span className="w-full border-t border-warm-200 dark:border-disc-border my-1" />
        )}
        {occasional.map(renderItem)}
      </div>
    </div>
  )
}

export default function CookingClient({ displayName }) {
  const [loading, setLoading] = useState(true)
  const [menus, setMenus] = useState([]) // loaded from DB (public menus)
  const [pantry, setPantry] = useState({}) // token -> 'have' | 'out'
  const [recent, setRecent] = useState([]) // menu_id[], newest first
  const [candidates, setCandidates] = useState(null) // null = ยังไม่สุ่ม, [] = สุ่มแล้วแต่ไม่มีเมนูที่ทำได้, [...] = 4 การ์ดผลสุ่ม
  const [result, setResult] = useState(null) // เมนูที่เลือกจาก candidates (null = ยังไม่เลือก โชว์ grid)
  const [lastMainId, setLastMainId] = useState(null)
  const [cookedMsg, setCookedMsg] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [ingredients, setIngredients] = useState([]) // public wiki — ทุกคนแก้ได้หมด ไม่มี owner แล้ว
  const [bulkPreview, setBulkPreview] = useState(null) // [{token,label,grp,include}] รอรีวิวก่อนเพิ่มจริง
  const [spinning, setSpinning] = useState(false)
  const [reelItems, setReelItems] = useState([]) // strip ของช่อง {name,emoji} ที่จะเลื่อนผ่านตอนหมุน
  const [reelOffset, setReelOffset] = useState(0) // translateY (px) ของ strip
  const [reelGo, setReelGo] = useState(false) // true = ใส่ transition (เริ่มหมุน), false = จัดตำแหน่งเริ่มต้นแบบไม่มี animation
  const [kitchens, setKitchens] = useState([])
  const [currentKitchenId, setCurrentKitchenId] = useState(null)
  const [editingMenu, setEditingMenu] = useState(null) // เมนูที่กำลังแก้ไขจากการ์ดผลสุ่ม (เปิด MenuForm modal)
  const [lightboxUrl, setLightboxUrl] = useState(null) // รูปเมนูที่เปิดดูเต็มจอ
  const spinRef = useRef(null)

  useEffect(() => {
    if (!lightboxUrl) return
    const onKey = e => e.key === 'Escape' && setLightboxUrl(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxUrl])

  useEffect(() => {
    Promise.all([
      fetch('/api/cooking/state').then(r => r.json()),
      fetch('/api/cooking/menus').then(r => r.json()),
      fetch('/api/cooking/ingredients').then(r => r.json()),
      fetch('/api/cooking/kitchens').then(r => r.json()),
    ])
      .then(([state, menuData, ingredientData, kitchenData]) => {
        const map = {}
        for (const row of state.pantry || []) map[row.ingredient] = row.status
        setPantry(map)
        setRecent(state.recent || [])
        setMenus(menuData.menus || [])
        setIngredients(ingredientData.ingredients || [])
        setKitchens(kitchenData.kitchens || [])
        setCurrentKitchenId(kitchenData.currentKitchenId || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => () => clearTimeout(spinRef.current), [])

  const menuById = useMemo(
    () => Object.fromEntries(menus.map(m => [m.id, m])),
    [menus]
  )

  const haveSet = useMemo(
    () => new Set(Object.keys(pantry).filter(k => pantry[k] === 'have')),
    [pantry]
  )

  function runSuggest() {
    const recentTags = recent
      .map(id => menuById[id])
      .filter(Boolean)
      .map(m => ({ protein: m.protein, method: m.method, cuisine: m.cuisine }))
    const meals = suggestMeals(menus, haveSet, recentTags, 4)

    const reveal = () => {
      setCandidates(meals)
      setResult(null)
      setLastMainId(null)
      setCookedMsg(false)
      setChatReply(null)
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pool = makeableMenus(menus, haveSet)
    if (!meals.length || reduceMotion || !pool.length) {
      reveal()
      return
    }

    clearTimeout(spinRef.current)
    setSpinning(true)

    // สร้าง strip ของช่องสุ่ม (ไม่ผูกกับผลจริง — ผลจริงโชว์เป็น grid 4 อันหลัง reveal)
    const items = Array.from({ length: REEL_ITEM_COUNT }, () => {
      const m = pool[Math.floor(Math.random() * pool.length)]
      return { name: m.name, emoji: m.image?.emoji || '🍽️' }
    })
    setReelItems(items)
    setReelGo(false)
    setReelOffset(0) // จัดตำแหน่งเริ่มต้นที่บนสุดโดยไม่มี transition ก่อน

    // double rAF: รอให้ browser paint ตำแหน่งเริ่มต้น(offset 0, ไม่มี transition) ก่อน แล้วค่อยเปิด transition
    // + เลื่อนไป offset ปลายทาง — ถ้าไม่รอ browser จะ batch แล้วข้ามไปตำแหน่งสุดท้ายทันทีโดยไม่มี animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReelGo(true)
        setReelOffset(-(items.length - 1) * REEL_ITEM_HEIGHT)
      })
    })

    // เวลาต้องตรงกับ transition duration ที่ใส่ inline style ด้านล่าง (REEL_SPIN_MS)
    spinRef.current = setTimeout(() => {
      setSpinning(false)
      setReelGo(false)
      reveal()
    }, REEL_SPIN_MS)
  }

  // เดาหมวดด้วย AI ผ่าน bulk endpoint เดียวกับที่ใช้แยกรายการ (ส่งคำเดียวก็ได้)
  // ล้มเหลว/ไม่คืน grp → fallback 'seasoning' ผู้ใช้แก้ทีหลังได้ที่ /cooking/ingredients
  async function guessGroupViaAI(label) {
    try {
      const res = await fetch('/api/cooking/ingredients/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: label }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.items?.[0]?.grp) return data.items[0].grp
    } catch {}
    return 'seasoning'
  }

  async function addCustomIngredient(input, grp) {
    const label = input.trim()
    if (!label) return { error: null }
    const dupe = findDuplicate(label, ingredients)
    if (dupe) return { error: `มีอยู่แล้ว: ${dupe.label || dupe.token}` }

    const finalGrp = grp || (await guessGroupViaAI(label))

    const res = await fetch('/api/cooking/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: label, label, grp: finalGrp }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { error: data.error || 'เพิ่มไม่สำเร็จ' }
    }
    const { ingredient } = await res.json()
    setIngredients(prev => [...prev, ingredient])
    return { error: null }
  }

  async function startBulkPreview(text) {
    const res = await fetch('/api/cooking/ingredients/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error || 'แยกรายการไม่สำเร็จ' }

    const deduped = []
    for (const item of data.items) {
      const dupe = findDuplicate(item.label, [...ingredients, ...deduped])
      if (!dupe) deduped.push({ ...item, include: true })
    }
    if (!deduped.length) return { error: 'มีอยู่แล้วทุกรายการ' }
    setBulkPreview(deduped)
    return { error: null }
  }

  function updateBulkItem(i, patch) {
    setBulkPreview(prev => prev.map((x, xi) => (xi === i ? { ...x, ...patch } : x)))
  }

  async function confirmBulkAdd() {
    const toAdd = bulkPreview.filter(i => i.include)
    setBulkPreview(null)
    let firstError = null
    for (const item of toAdd) {
      const { error } = await addCustomIngredient(item.label, item.grp)
      if (error && !firstError) firstError = error
    }
    if (firstError) alert(firstError)
  }

  function cyclePantry(token) {
    const current = pantry[token]
    const next = nextStatus(current)
    setPantry(prev => {
      const copy = { ...prev }
      if (next === 'clear') delete copy[token]
      else copy[token] = next
      return copy
    })
    fetch('/api/cooking/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, status: next }),
    }).catch(() => {})
  }

  // ซื้อจากตลาดแล้ว → เด้งกลับเป็น "มี" (หายจากลิสต์ตลาด ขึ้นไปอยู่เขียว)
  function markHave(token) {
    setPantry(prev => ({ ...prev, [token]: 'have' }))
    fetch('/api/cooking/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, status: 'have' }),
    }).catch(() => {})
  }

  // แก้ไขเมนูจากการ์ดผลสุ่ม — อัพเดตทั้ง menus (สำหรับสุ่มครั้งถัดไป) และ result.main (โชว์ผลทันที)
  function handleMenuSaved(updatedMenu) {
    setMenus(prev => prev.map(m => (m.id === updatedMenu.id ? updatedMenu : m)))
    setResult(prev => (prev && prev.main.id === updatedMenu.id ? { ...prev, main: updatedMenu } : prev))
    setCandidates(prev =>
      prev ? prev.map(c => (c.main.id === updatedMenu.id ? { ...c, main: updatedMenu } : c)) : prev
    )
  }

  async function markCooked() {
    if (!result || result.empty) return
    await fetch('/api/cooking/cooked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_id: result.main.id }),
    }).catch(() => {})
    setRecent(prev => [result.main.id, ...prev])
    setCookedMsg(true)
  }

  async function askChat() {
    if (!chatInput.trim() || chatLoading) return
    setChatLoading(true)
    setChatReply(null)
    try {
      const res = await fetch('/api/cooking/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: chatInput.trim() }],
          context: {
            available: Array.from(haveSet),
            menu: result && !result.empty ? result.main.name : null,
          },
        }),
      })
      const data = await res.json()
      setChatReply(res.ok ? data.reply : 'ถามไม่สำเร็จ ลองใหม่อีกครั้ง')
    } catch {
      setChatReply('ถามไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
    setChatLoading(false)
  }

  const marketTokens = Object.keys(pantry).filter(t => pantry[t] === 'out')
  const labelFor = token => ingredients.find(c => c.token === token)?.label || token
  const byGroup = grp => ingredients.filter(i => i.grp === grp)
  const currentKitchen = kitchens.find(k => k.id === currentKitchenId)

  async function switchKitchen(kitchenId) {
    const res = await fetch('/api/cooking/kitchens/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kitchenId }),
    })
    if (!res.ok) return
    window.location.reload() // pantry/history เปลี่ยนทั้งชุด — โหลดใหม่ให้ชัวร์ว่า sync
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-warm-500 dark:text-disc-muted">
        กำลังโหลด...
      </div>
    )
  }

  return (
    <div className="py-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">
          {displayName ? `${displayName}, ` : ''}วันนี้ทำอะไรกินดี?
        </h1>
        <Link
          href="/cooking/menus"
          className="text-sm text-[#E57A72] hover:opacity-80 whitespace-nowrap shrink-0"
        >
          คลังเมนู →
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 text-xs text-warm-500 dark:text-disc-muted">
          <span>🏠 {currentKitchen?.name || 'ครัวของฉัน'}</span>
          {kitchens.length > 1 && (
            <select
              value={currentKitchenId || ''}
              onChange={e => switchKitchen(Number(e.target.value))}
              className="ml-1 px-1 py-0.5 rounded border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-xs"
            >
              {kitchens.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          )}
        </div>
        <Link
          href="/cooking/kitchen"
          className="text-xs text-warm-500 dark:text-disc-muted hover:opacity-80 whitespace-nowrap shrink-0"
        >
          จัดการครัว →
        </Link>
      </div>

      <button
        type="button"
        onClick={() => runSuggest()}
        className="w-full bg-[#ff6a13] hover:bg-[#f37a2c] text-white rounded-lg text-base font-medium px-4 py-3 transition"
      >
        🎲 สุ่มให้เลย
      </button>

      {spinning && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 flex flex-col items-center">
          <p className="text-sm font-medium text-[#ff6a13] mb-3">🎰 กำลังสุ่มเมนู...</p>
          {/* หน้าต่างสูง 1 ช่อง (REEL_ITEM_HEIGHT) — strip ด้านในเลื่อน translateY ผ่านหน้าต่างนี้เหมือน reel สล็อตจริง */}
          <div className="relative w-full max-w-xs h-32 overflow-hidden rounded-lg bg-warm-50 dark:bg-disc-hover">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-card-bg to-transparent z-10" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card-bg to-transparent z-10" />
            <div
              style={{
                transform: `translateY(${reelOffset}px)`,
                transition: reelGo
                  ? `transform ${REEL_SPIN_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1)`
                  : 'none',
              }}
            >
              {reelItems.map((it, i) => (
                <div key={i} className="h-32 flex flex-col items-center justify-center">
                  <span className="text-5xl leading-none">{it.emoji}</span>
                  <span className="mt-1 text-base font-bold text-warm-900 dark:text-disc-text truncate max-w-[90%]">
                    {it.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!spinning && candidates && candidates.length === 0 && !result && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          <p className="text-warm-500 dark:text-disc-muted text-sm">
            ยังไม่มีเมนูที่ทำได้จากของที่มี — ติ๊กวัตถุดิบเพิ่ม หรือไปตลาด
          </p>
        </div>
      )}

      {!spinning && candidates && candidates.length > 0 && !result && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {candidates.map(meal => (
            <button
              key={meal.main.id}
              type="button"
              onClick={() => {
                setResult(meal)
                setLastMainId(meal.main.id)
                setCookedMsg(false)
                setChatReply(null)
              }}
              className="text-left bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-3 hover:-translate-y-0.5 hover:shadow-md transition"
            >
              {meal.main.image?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={meal.main.image.url}
                  alt={meal.main.name}
                  className="w-full h-32 object-cover rounded-lg"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center rounded-lg bg-warm-50 dark:bg-disc-hover">
                  <span className="text-4xl leading-none">{meal.main.image?.emoji || '🍽️'}</span>
                </div>
              )}
              <p className="mt-2 font-bold text-warm-900 dark:text-disc-text">{meal.main.name}</p>
              <p className="text-xs text-warm-500 dark:text-disc-muted mt-0.5 truncate">
                {meal.main.ingredients?.core?.join(', ')}
              </p>
            </button>
          ))}
        </div>
      )}

      {!spinning && result && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-full sm:w-64 shrink-0">
              {result.main.image?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.main.image.url}
                  alt={result.main.name}
                  onClick={() => setLightboxUrl(result.main.image.url)}
                  className="w-full h-56 sm:h-64 object-cover rounded-lg cursor-zoom-in"
                />
              ) : (
                <div className="w-full h-56 sm:h-64 flex items-center justify-center rounded-lg bg-warm-50 dark:bg-disc-hover">
                  <span className="text-6xl leading-none">{result.main.image?.emoji || '🍽️'}</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xl font-bold text-warm-900 dark:text-disc-text min-w-0">
                  {result.main.name}
                </p>
                <button
                  type="button"
                  onClick={() => setEditingMenu(result.main)}
                  className="text-sm text-[#E57A72] hover:opacity-80 whitespace-nowrap shrink-0"
                >
                  แก้ไข
                </button>
              </div>

              <p className="text-sm italic text-warm-500 dark:text-disc-muted mt-1">
                {result.reason}
              </p>

              <p className="text-sm font-medium text-warm-900 dark:text-disc-text mt-3">เครื่องปรุง</p>
              <p className="text-sm text-warm-500 dark:text-disc-muted">
                {result.main.ingredients?.core?.join(', ')}
              </p>

              <p className="text-sm font-medium text-warm-900 dark:text-disc-text mt-3 mb-1">วิธีทำ</p>
              <ol className="list-decimal list-inside text-sm text-warm-500 dark:text-disc-muted space-y-0.5">
                {result.main.steps?.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setResult(null)}
              className="flex-1 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              ← กลับไปดู 4 อัน
            </button>
            <button
              type="button"
              onClick={markCooked}
              className="flex-1 bg-[#AAD9CE] hover:bg-[#93cabb] text-[#1f4a3d] rounded-lg px-4 py-2 text-sm font-medium transition"
            >
              ทำแล้ว ✓
            </button>
          </div>
          {cookedMsg && (
            <p className="mt-2 text-sm text-teal text-center">บันทึกแล้ว — เก็บไว้กันซ้ำเมนูไม่กี่วันนี้</p>
          )}
        </div>
      )}

      {!spinning && result && (
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && askChat()}
              placeholder="ถามเพิ่มเติม เช่น ไม่มีกะปิทำไงดี"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-sm placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal transition"
            />
            <button
              type="button"
              onClick={askChat}
              disabled={chatLoading}
              className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
            >
              {chatLoading ? '...' : 'ถาม'}
            </button>
          </div>
          {chatReply && (
            <div className="mt-2 bg-warm-50 dark:bg-disc-hover rounded-lg p-3 text-sm text-warm-500 dark:text-disc-muted">
              {chatReply}
            </div>
          )}
        </div>
      )}

      {marketTokens.length > 0 && (
        <div className="mt-6 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          <p className="text-base font-semibold text-warm-900 dark:text-disc-text mb-1 flex items-center gap-1.5">
            <CartIcon className="w-4 h-4 inline-block" /> ไปตลาด
          </p>
          <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">แตะเมื่อซื้อแล้ว → กลับไปเป็น "มี"</p>
          <div className="flex flex-wrap gap-2">
            {marketTokens.map(token => (
              <button
                key={token}
                type="button"
                onClick={() => markHave(token)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-base bg-[#E688A1] text-[#4a1f2e] hover:bg-[#dd7690] transition"
              >
                {labelFor(token)}
                <span className="text-xs opacity-70">✓</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <details open className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
        <summary className="cursor-pointer text-base font-semibold text-warm-900 dark:text-disc-text select-none">
          ของในครัว
        </summary>
        <div className="flex items-center justify-between gap-3 mt-2 mb-3">
          <p className="text-xs text-warm-400 dark:text-disc-muted flex items-center gap-1">
            ✓ มี · <CartIcon className="w-3.5 h-3.5 inline-block" /> หมด · แตะเพื่อสลับ
          </p>
          <Link
            href="/cooking/ingredients"
            className="text-xs text-[#E57A72] hover:opacity-80 whitespace-nowrap shrink-0"
          >
            จัดการวัตถุดิบ →
          </Link>
        </div>
        <AddIngredientRow onAdd={addCustomIngredient} onBulkPreview={startBulkPreview} />
        {bulkPreview && (
          <div className="mt-3 pt-3 border-t border-warm-200 dark:border-disc-border">
            <p className="text-sm font-medium text-warm-900 dark:text-disc-text mb-2">
              ตรวจก่อนเพิ่ม ({bulkPreview.length} รายการ)
            </p>
            <div className="space-y-2">
              {bulkPreview.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.include}
                    onChange={e => updateBulkItem(i, { include: e.target.checked })}
                  />
                  <input
                    type="text"
                    value={item.label}
                    onChange={e => updateBulkItem(i, { label: e.target.value, token: e.target.value })}
                    className="flex-1 min-w-0 px-2 py-1 rounded border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-sm"
                  />
                  <select
                    value={item.grp}
                    onChange={e => updateBulkItem(i, { grp: e.target.value })}
                    className="px-2 py-1 rounded border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-sm"
                  >
                    {GROUP_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setBulkPreview(null)}
                className="flex-1 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-3 py-1.5 text-sm font-medium transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmBulkAdd}
                className="flex-1 bg-[#AAD9CE] hover:bg-[#93cabb] text-[#1f4a3d] rounded-lg px-3 py-1.5 text-sm font-medium transition"
              >
                เพิ่มทั้งหมด
              </button>
            </div>
          </div>
        )}
        <div className="mt-3">
          {GROUP_OPTIONS.map(o => (
            <ChipGroup
              key={o.value}
              heading={o.label}
              items={byGroup(o.value)}
              pantry={pantry}
              onCycle={cyclePantry}
            />
          ))}
        </div>
      </details>

      {editingMenu && (
        <MenuForm
          mode="edit"
          menu={editingMenu}
          onClose={() => setEditingMenu(null)}
          onSaved={handleMenuSaved}
        />
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="" className="max-w-full max-h-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
