'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import canonicalData from './data/canonical.json'
import { suggestMeal, makeableMenus } from '@/lib/cookingMatch.js'

// normalize for client-side dedup: strip spaces/case before comparing
const norm = s => s.trim().toLowerCase().replace(/\s+/g, '')

function findDuplicate(input, existing) {
  const n = norm(input)
  for (const c of existing) {
    const nt = norm(c.token)
    const nl = norm(c.label || c.token)
    if (n === nt || n === nl) return c
    if (n.length >= 2 && nt.length >= 2 && (n.includes(nt) || nt.includes(n))) return c
    if (n.length >= 2 && nl.length >= 2 && (n.includes(nl) || nl.includes(n))) return c
  }
  return null
}

// เดากลุ่มจากคำในชื่อ — deterministic ไม่พึ่ง AI (เหมือน matcher หลัก) ผู้ใช้แก้ทับได้ที่ select
const PROTEIN_HINTS = ['หมู', 'ไก่', 'วัว', 'เนื้อ', 'กุ้ง', 'ปลา', 'ไข่', 'เป็ด', 'แพะ', 'ปู', 'หมึก', 'กบ', 'แกะ', 'เต้าหู้', 'กระบือ', 'ห่าน']
const VEG_HINTS = ['ผัก', 'ใบ', 'หัว', 'ดอก', 'ฝัก', 'ถั่ว', 'เห็ด', 'มะเขือ', 'แตง', 'ฟัก', 'บวบ', 'กะหล่ำ', 'คะน้า', 'หน่อ', 'ยอด', 'สะตอ', 'ชะอม', 'กวางตุ้ง']

function guessGroup(text) {
  const s = text.trim()
  if (!s) return 'special'
  if (PROTEIN_HINTS.some(k => s.includes(k))) return 'protein'
  if (VEG_HINTS.some(k => s.includes(k))) return 'veg'
  return 'special'
}

const CHIP_BASE =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition'
// 3 สถานะ สี pastel ต่างกันชัด: มี=เขียวอ่อน · หมด=ชมพูอ่อน(เตือน) · ยังไม่ติ๊ก=เทาโปร่งเส้นประ
const CHIP_NEUTRAL =
  'border-dashed border-warm-300 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
const CHIP_HAVE =
  'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
const CHIP_OUT =
  'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-300'

function nextStatus(current) {
  if (current === 'have') return 'out'
  if (current === 'out') return 'clear'
  return 'have'
}

function Chip({ token, label, status, onCycle, custom, onRemove }) {
  const cls =
    status === 'have' ? CHIP_HAVE : status === 'out' ? CHIP_OUT : CHIP_NEUTRAL
  return (
    <span
      className={`inline-flex items-center gap-1 pl-3 py-1.5 rounded-full text-sm border transition ${custom ? 'pr-1' : 'pr-3'} ${cls}`}
    >
      <button type="button" onClick={() => onCycle(token)} className="inline-flex items-center gap-1">
        {status === 'have' && <span>✓</span>}
        {status === 'out' && <span>🛒</span>}
        <span>{label}</span>
      </button>
      {custom && (
        <button
          type="button"
          onClick={() => onRemove(token)}
          aria-label={`ลบ ${label}`}
          className="w-4 h-4 flex items-center justify-center rounded-full text-xs leading-none hover:bg-black/10 dark:hover:bg-white/10"
        >
          ✕
        </button>
      )}
    </span>
  )
}

function AddIngredientRow({ onAdd, onBulkPreview }) {
  const [text, setText] = useState('')
  const [grp, setGrp] = useState('special')
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
    setGrp('special')
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
          <option value="protein">โปรตีน</option>
          <option value="veg">ผัก</option>
          <option value="special">ของเฉพาะ</option>
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

function ChipGroup({ heading, items, pantry, onCycle, onRemove }) {
  const regular = items.filter(i => i.tier !== 'occasional')
  const occasional = items.filter(i => i.tier === 'occasional')
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-sm font-medium text-warm-500 dark:text-disc-muted mb-2">{heading}</p>
      <div className="flex flex-wrap gap-2">
        {regular.map(i => (
          <Chip
            key={i.token}
            token={i.token}
            label={i.label || i.token}
            status={pantry[i.token]}
            onCycle={onCycle}
            custom={i.custom}
            onRemove={onRemove}
          />
        ))}
        {occasional.length > 0 && (
          <span className="w-full border-t border-warm-200 dark:border-disc-border my-1" />
        )}
        {occasional.map(i => (
          <Chip
            key={i.token}
            token={i.token}
            label={i.label || i.token}
            status={pantry[i.token]}
            onCycle={onCycle}
            custom={i.custom}
            onRemove={onRemove}
          />
        ))}
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
  const [customIngredients, setCustomIngredients] = useState([])
  const [bulkPreview, setBulkPreview] = useState(null) // [{token,label,grp,include}] รอรีวิวก่อนเพิ่มจริง
  const [spinning, setSpinning] = useState(false)
  const [reel, setReel] = useState(null)
  const spinRef = useRef(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/cooking/state').then(r => r.json()),
      fetch('/api/cooking/menus').then(r => r.json()),
      fetch('/api/cooking/ingredients').then(r => r.json()),
    ])
      .then(([state, menuData, ingredientData]) => {
        const map = {}
        for (const row of state.pantry || []) map[row.ingredient] = row.status
        setPantry(map)
        setRecent(state.recent || [])
        setMenus(menuData.menus || [])
        setCustomIngredients(ingredientData.ingredients || [])
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
    const dupe = findDuplicate(label, allCanonical)
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
    setCustomIngredients(prev => [...prev, ingredient])
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
      const dupe = findDuplicate(item.label, [...allCanonical, ...deduped])
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
    for (const item of toAdd) {
      await addCustomIngredient(item.label, item.grp)
    }
  }

  async function removeCustomIngredient(token) {
    const item = customIngredients.find(i => i.token === token)
    if (!item) return
    setCustomIngredients(prev => prev.filter(i => i.id !== item.id))
    setPantry(prev => {
      if (!(token in prev)) return prev
      const copy = { ...prev }
      delete copy[token]
      return copy
    })
    await fetch(`/api/cooking/ingredients/${item.id}`, { method: 'DELETE' }).catch(() => {})
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
  const allCanonical = [
    ...canonicalData.protein,
    ...canonicalData.veg,
    ...canonicalData.special,
    ...customIngredients,
  ]
  const labelFor = token => allCanonical.find(c => c.token === token)?.label || token
  // ถ้า token นี้ถูกย้ายเข้า DB เป็นของ owner แล้ว (migrateCanonicalToOwn.js) ใช้แถว DB แทน
  // static — กันโชว์ซ้ำ 2 อัน · ผู้ใช้ใหม่ที่ยังไม่ได้ย้ายจะยังเห็น static ตามเดิม (graceful fallback)
  const byGroup = grp => {
    const custom = customIngredients.filter(i => i.grp === grp)
    const customTokens = new Set(custom.map(i => i.token))
    const base = canonicalData[grp].filter(i => !customTokens.has(i.token))
    return [...base, ...custom.map(i => ({ ...i, custom: true }))]
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
      <div className="flex items-center justify-between gap-3 mb-4">
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

      <button
        type="button"
        onClick={() => runSuggest(null)}
        className="w-full bg-[#E57A72] hover:bg-[#d5685f] text-white rounded-lg text-base font-medium px-4 py-3 transition"
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
                  className="flex-1 bg-[#C1F0B4] hover:bg-[#aee89d] text-emerald-900 rounded-lg px-4 py-2 text-sm font-medium transition"
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
        <p className="text-xs text-warm-400 dark:text-disc-muted mt-2 mb-3">
          ✓ มี · 🛒 หมด · แตะเพื่อสลับ
        </p>
        <div className="mt-2">
          <ChipGroup
            heading="โปรตีน"
            items={byGroup('protein')}
            pantry={pantry}
            onCycle={cyclePantry}
            onRemove={removeCustomIngredient}
          />
          <ChipGroup
            heading="ผัก"
            items={byGroup('veg')}
            pantry={pantry}
            onCycle={cyclePantry}
            onRemove={removeCustomIngredient}
          />
          <ChipGroup
            heading="ของเฉพาะ"
            items={byGroup('special')}
            pantry={pantry}
            onCycle={cyclePantry}
            onRemove={removeCustomIngredient}
          />
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
                    <option value="protein">โปรตีน</option>
                    <option value="veg">ผัก</option>
                    <option value="special">ของเฉพาะ</option>
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
                className="flex-1 bg-[#C1F0B4] hover:bg-[#aee89d] text-emerald-900 rounded-lg px-3 py-1.5 text-sm font-medium transition"
              >
                เพิ่มทั้งหมด
              </button>
            </div>
          </div>
        )}
      </details>

      {marketTokens.length > 0 && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          <p className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2">🛒 ไปตลาด</p>
          <div className="flex flex-wrap gap-2">
            {marketTokens.map(token => (
              <span
                key={token}
                className="px-3 py-1 rounded-full text-sm bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300"
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
