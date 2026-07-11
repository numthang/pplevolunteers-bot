'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { suggestMeal, makeableMenus } from '@/lib/cookingMatch.js'

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

// เดากลุ่มจากคำในชื่อ — deterministic ไม่พึ่ง AI (เหมือน matcher หลัก) ผู้ใช้แก้ทับได้ที่ select
const PROTEIN_HINTS = ['หมู', 'ไก่', 'วัว', 'เนื้อ', 'กุ้ง', 'ปลา', 'ไข่', 'เป็ด', 'แพะ', 'ปู', 'หมึก', 'กบ', 'แกะ', 'เต้าหู้', 'กระบือ', 'ห่าน']
const VEG_HINTS = ['ผัก', 'ใบ', 'หัว', 'ดอก', 'ฝัก', 'ถั่ว', 'เห็ด', 'มะเขือ', 'แตง', 'ฟัก', 'บวบ', 'กะหล่ำ', 'คะน้า', 'หน่อ', 'ยอด', 'สะตอ', 'ชะอม', 'กวางตุ้ง', 'กุยช่าย', 'ผลไม้']
const STARCH_HINTS = ['เส้น', 'วุ้นเส้น', 'ข้าวเหนียว', 'สปาเกตตี', 'พาสต้า', 'ขนมปัง', 'แป้ง', 'ข้าว']
const DAIRY_HINTS = ['นม', 'ชีส', 'เนย', 'ครีม', 'โยเกิร์ต']
const SEASONING_HINTS = ['กะทิ', 'กะปิ', 'ซอส', 'พริกแกง', 'เครื่องแกง', 'มายองเนส', 'มัสตาร์ด', 'น้ำจิ้ม', 'ผงกะหรี่', 'มิโซะ', 'น้ำพริก', 'หอม', 'สมุนไพร']

function guessGroup(text) {
  const s = text.trim()
  if (!s) return 'seasoning'
  if (PROTEIN_HINTS.some(k => s.includes(k))) return 'protein'
  if (VEG_HINTS.some(k => s.includes(k))) return 'veg'
  if (DAIRY_HINTS.some(k => s.includes(k))) return 'dairy'
  if (STARCH_HINTS.some(k => s.includes(k))) return 'starch'
  if (SEASONING_HINTS.some(k => s.includes(k))) return 'seasoning'
  return 'seasoning'
}

const CHIP_BASE =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition'
// 3 สถานะ สี pastel ต่างกันชัด: มี=เขียวอ่อน · หมด=ชมพูอ่อน(เตือน) · ยังไม่ติ๊ก=เทาโปร่งเส้นประ
const CHIP_NEUTRAL =
  'border-dashed border-warm-300 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
// สีจากคลังพาสเทลของ user: มี = ชุด "เขียว" (#AAD9CE) · หมด = ชุด "ชมพูอ่อน" (#E688A1)
const CHIP_HAVE = 'border-transparent bg-[#AAD9CE] text-[#1f4a3d]'
const CHIP_OUT = 'border-transparent bg-[#E688A1] text-[#4a1f2e]'

function nextStatus(current) {
  if (current === 'have') return 'out'
  if (current === 'out') return 'clear'
  return 'have'
}

function Chip({ id, token, label, status, onCycle, onRemove, onEditStart }) {
  const cls =
    status === 'have' ? CHIP_HAVE : status === 'out' ? CHIP_OUT : CHIP_NEUTRAL
  return (
    <span
      className={`inline-flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-full text-sm border transition ${cls}`}
    >
      <button type="button" onClick={() => onCycle(token)} className="inline-flex items-center gap-1">
        {status === 'have' && <span>✓</span>}
        {status === 'out' && <CartIcon />}
        <span>{label}</span>
      </button>
      <button
        type="button"
        onClick={() => onEditStart(id)}
        aria-label={`แก้ไข ${label}`}
        className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none hover:bg-black/10 dark:hover:bg-white/10"
      >
        ✎
      </button>
      <button
        type="button"
        onClick={() => onRemove(token)}
        aria-label={`ลบ ${label}`}
        className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none hover:bg-black/10 dark:hover:bg-white/10"
      >
        ✕
      </button>
    </span>
  )
}

function EditChip({ item, onSave, onCancel }) {
  const [label, setLabel] = useState(item.label)
  const [grp, setGrp] = useState(item.grp)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!label.trim() || busy) return
    setBusy(true)
    await onSave(item.id, { label: label.trim(), grp })
    setBusy(false)
  }

  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-sm border border-warm-300 dark:border-disc-border bg-card-bg">
      <input
        type="text"
        value={label}
        onChange={e => setLabel(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && save()}
        className="w-24 min-w-0 px-1.5 py-0.5 rounded border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-xs"
      />
      <select
        value={grp}
        onChange={e => setGrp(e.target.value)}
        className="px-1 py-0.5 rounded border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-xs"
      >
        {GROUP_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        aria-label="บันทึก"
        className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-50"
      >
        ✓
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="ยกเลิก"
        className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none hover:bg-black/10 dark:hover:bg-white/10"
      >
        ✕
      </button>
    </span>
  )
}

function AddIngredientRow({ onAdd, onBulkPreview }) {
  const [text, setText] = useState('')
  const [grp, setGrp] = useState('seasoning')
  const [manualGrp, setManualGrp] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  function handleTextChange(v) {
    setText(v)
    if (!manualGrp) setGrp(guessGroup(v))
  }

  function handleGrpChange(v) {
    setGrp(v)
    setManualGrp(true)
  }

  function reset() {
    setText('')
    setGrp('seasoning')
    setManualGrp(false)
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

    const { error } = await onAdd(text, grp)
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
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="เพิ่มของในครัว เช่น ผักหวานบ้าน หรือคั่นด้วย , ใส่หลายอย่างพร้อมกัน"
          className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-sm placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal transition"
        />
        <select
          value={grp}
          onChange={e => handleGrpChange(e.target.value)}
          disabled={text.includes(',')}
          className="px-2 py-1.5 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text text-sm disabled:opacity-40"
        >
          {GROUP_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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

function ChipGroup({ heading, items, pantry, onCycle, onRemove, editingId, onEditStart, onEditSave, onEditCancel }) {
  const regular = items.filter(i => i.tier !== 'occasional')
  const occasional = items.filter(i => i.tier === 'occasional')
  const renderItem = i =>
    i.id === editingId ? (
      <EditChip key={i.token} item={i} onSave={onEditSave} onCancel={onEditCancel} />
    ) : (
      <Chip
        key={i.token}
        id={i.id}
        token={i.token}
        label={i.label || i.token}
        status={pantry[i.token]}
        onCycle={onCycle}
        onRemove={onRemove}
        onEditStart={onEditStart}
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
  const [result, setResult] = useState(null)
  const [lastMainId, setLastMainId] = useState(null)
  const [cookedMsg, setCookedMsg] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [ingredients, setIngredients] = useState([]) // public wiki — ทุกคนแก้ได้หมด ไม่มี owner แล้ว
  const [bulkPreview, setBulkPreview] = useState(null) // [{token,label,grp,include}] รอรีวิวก่อนเพิ่มจริง
  const [editingIngredientId, setEditingIngredientId] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const [reel, setReel] = useState(null)
  const [kitchens, setKitchens] = useState([])
  const [currentKitchenId, setCurrentKitchenId] = useState(null)
  const spinRef = useRef(null)

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

  useEffect(() => () => clearInterval(spinRef.current), [])

  const menuById = useMemo(
    () => Object.fromEntries(menus.map(m => [m.id, m])),
    [menus]
  )

  const haveSet = useMemo(
    () => new Set(Object.keys(pantry).filter(k => pantry[k] === 'have')),
    [pantry]
  )

  function runSuggest(excludeId = null) {
    const recentTags = recent
      .map(id => menuById[id])
      .filter(Boolean)
      .map(m => ({ protein: m.protein, method: m.method, cuisine: m.cuisine }))
    const r = suggestMeal(menus, haveSet, recentTags, { excludeId })

    const reveal = () => {
      setResult(r)
      setLastMainId(r.empty ? null : r.main.id)
      setCookedMsg(false)
      setChatReply(null)
    }

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pool = makeableMenus(menus, haveSet)
    if (r.empty || reduceMotion || !pool.length) {
      reveal()
      return
    }

    clearInterval(spinRef.current)
    setSpinning(true)
    spinRef.current = setInterval(() => {
      const m = pool[Math.floor(Math.random() * pool.length)]
      setReel({ name: m.name, emoji: m.image?.emoji || '🍽️' })
    }, 80)
    setTimeout(() => {
      clearInterval(spinRef.current)
      setSpinning(false)
      setReel(null)
      reveal()
    }, 900)
  }

  async function addCustomIngredient(input, grp) {
    const label = input.trim()
    if (!label) return { error: null }
    const dupe = findDuplicate(label, ingredients)
    if (dupe) return { error: `มีอยู่แล้ว: ${dupe.label || dupe.token}` }

    const res = await fetch('/api/cooking/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: label, label, grp }),
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

  async function updateCustomIngredient(id, { label, grp }) {
    const res = await fetch(`/api/cooking/ingredients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, grp }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'แก้ไขไม่สำเร็จ')
      return
    }
    const { ingredient } = await res.json()
    setIngredients(prev => prev.map(i => (i.id === id ? ingredient : i)))
    setEditingIngredientId(null)
  }

  async function removeCustomIngredient(token) {
    const item = ingredients.find(i => i.token === token)
    if (!item) return

    // gates.key ผูกด้วย token ตรงๆ ไม่ใช่ FK — ลบแล้วเมนูที่ใช้ token นี้เป็นเงื่อนไขจะทำได้ไม่ได้อีกเลย (เงียบๆ)
    const usedBy = menus.filter(m => (m.gates?.key || []).includes(token))
    if (usedBy.length) {
      const names = usedBy.map(m => m.name).join(', ')
      const ok = window.confirm(
        `"${item.label}" เป็นเงื่อนไขของเมนู: ${names}\nลบแล้วเมนูนี้จะไม่มีวันขึ้นว่า "ทำได้" อีก จนกว่าจะเพิ่มของชื่อเดิมกลับมา\n\nยืนยันลบ?`
      )
      if (!ok) return
    }

    const res = await fetch(`/api/cooking/ingredients/${item.id}`, { method: 'DELETE' }).catch(() => null)
    if (!res || !res.ok) {
      const data = await res?.json().catch(() => ({})) || {}
      alert(data.error || 'ลบไม่สำเร็จ')
      return
    }

    setIngredients(prev => prev.filter(i => i.id !== item.id))
    setPantry(prev => {
      if (!(token in prev)) return prev
      const copy = { ...prev }
      delete copy[token]
      return copy
    })
    fetch('/api/cooking/pantry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, status: 'clear' }),
    }).catch(() => {})
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
        onClick={() => runSuggest(null)}
        className="w-full bg-[#ED9A73] hover:bg-[#e2835a] text-white rounded-lg text-base font-medium px-4 py-3 transition"
      >
        🎲 สุ่มให้เลย
      </button>

      {spinning && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-8 flex flex-col items-center justify-center">
          <span className="text-5xl leading-none transition-opacity duration-75">
            {reel?.emoji || '🍽️'}
          </span>
          <p className="mt-3 text-lg font-bold text-warm-900 dark:text-disc-text transition-opacity duration-75">
            {reel?.name || '...'}
          </p>
        </div>
      )}

      {!spinning && result && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          {result.empty ? (
            <p className="text-warm-500 dark:text-disc-muted text-sm">
              ยังไม่มีเมนูที่ทำได้จากของที่มี — ติ๊กวัตถุดิบเพิ่ม หรือไปตลาด
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none">{result.main.image?.emoji || '🍽️'}</span>
                <div className="min-w-0">
                  <p className="text-xl font-bold text-warm-900 dark:text-disc-text">
                    {result.main.name}
                    {result.side && (
                      <span className="text-base font-normal text-warm-500 dark:text-disc-muted">
                        {' '}+ {result.side.name}
                      </span>
                    )}
                  </p>
                  {result.carb && (
                    <p className="text-sm text-warm-500 dark:text-disc-muted mt-0.5">
                      เสิร์ฟกับ{result.carb}
                    </p>
                  )}
                  <p className="text-sm italic text-warm-500 dark:text-disc-muted mt-1">
                    {result.reason}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-medium text-warm-900 dark:text-disc-text mb-1">เครื่องปรุง</p>
                <p className="text-sm text-warm-500 dark:text-disc-muted">
                  {result.main.ingredients?.core?.join(', ')}
                </p>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-warm-900 dark:text-disc-text mb-1 select-none">
                  วิธีทำ
                </summary>
                <ol className="list-decimal list-inside text-sm text-warm-500 dark:text-disc-muted space-y-0.5 mt-1">
                  {result.main.steps?.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </details>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => runSuggest(lastMainId)}
                  className="flex-1 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg px-4 py-2 text-sm font-medium transition"
                >
                  เอาอันอื่น
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
            </>
          )}
        </div>
      )}

      {!spinning && result && !result.empty && (
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

      <details open className="mt-6 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
        <summary className="cursor-pointer text-base font-semibold text-warm-900 dark:text-disc-text select-none">
          ของในครัว
        </summary>
        <p className="text-xs text-warm-400 dark:text-disc-muted mt-2 mb-3 flex items-center gap-1">
          ✓ มี · <CartIcon className="w-3.5 h-3.5 inline-block" /> หมด · แตะเพื่อสลับ
        </p>
        <div className="mt-2">
          {GROUP_OPTIONS.map(o => (
            <ChipGroup
              key={o.value}
              heading={o.label}
              items={byGroup(o.value)}
              pantry={pantry}
              onCycle={cyclePantry}
              onRemove={removeCustomIngredient}
              editingId={editingIngredientId}
              onEditStart={setEditingIngredientId}
              onEditSave={updateCustomIngredient}
              onEditCancel={() => setEditingIngredientId(null)}
            />
          ))}
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
      </details>

      {marketTokens.length > 0 && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          <p className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2 flex items-center gap-1.5">
            <CartIcon className="w-4 h-4 inline-block" /> ไปตลาด
          </p>
          <div className="flex flex-wrap gap-2">
            {marketTokens.map(token => (
              <span
                key={token}
                className="px-3 py-1 rounded-full text-sm bg-[#E688A1] text-[#4a1f2e]"
              >
                {labelFor(token)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
