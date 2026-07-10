'use client'
import { useEffect, useMemo, useState } from 'react'
import canonicalData from './data/canonical.json'
import { suggestMeal } from '@/lib/cookingMatch.js'

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

function Chip({ token, label, status, onCycle }) {
  const cls =
    status === 'have' ? CHIP_HAVE : status === 'out' ? CHIP_OUT : CHIP_NEUTRAL
  return (
    <button
      type="button"
      onClick={() => onCycle(token)}
      className={`${CHIP_BASE} ${cls}`}
    >
      {status === 'have' && <span>✓</span>}
      {status === 'out' && <span>🛒</span>}
      <span>{label}</span>
    </button>
  )
}

function ChipGroup({ heading, items, pantry, onCycle }) {
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
          />
        ))}
      </div>
    </div>
  )
}

export default function CookingClient() {
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

  useEffect(() => {
    Promise.all([
      fetch('/api/cooking/state').then(r => r.json()),
      fetch('/api/cooking/menus').then(r => r.json()),
    ])
      .then(([state, menuData]) => {
        const map = {}
        for (const row of state.pantry || []) map[row.ingredient] = row.status
        setPantry(map)
        setRecent(state.recent || [])
        setMenus(menuData.menus || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

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
    setResult(r)
    setLastMainId(r.empty ? null : r.main.id)
    setCookedMsg(false)
    setChatReply(null)
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
  ]
  const labelFor = token => allCanonical.find(c => c.token === token)?.label || token

  if (loading) {
    return (
      <div className="py-16 text-center text-warm-500 dark:text-disc-muted">
        กำลังโหลด...
      </div>
    )
  }

  return (
    <div className="py-4">
      <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-4">
        วันนี้กินอะไรดี?
      </h1>

      <button
        type="button"
        onClick={() => runSuggest(null)}
        className="w-full bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-3 transition"
      >
        🎲 สุ่มให้เลย
      </button>

      {result && (
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

              <div className="mt-3">
                <p className="text-sm font-medium text-warm-900 dark:text-disc-text mb-1">วิธีทำ</p>
                <ol className="list-decimal list-inside text-sm text-warm-500 dark:text-disc-muted space-y-0.5">
                  {result.main.steps?.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </div>

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
                  className="flex-1 bg-teal hover:opacity-90 text-white rounded-lg px-4 py-2 text-sm font-medium transition"
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

      {result && !result.empty && (
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
            items={canonicalData.protein}
            pantry={pantry}
            onCycle={cyclePantry}
          />
          <ChipGroup
            heading="ผัก"
            items={canonicalData.veg}
            pantry={pantry}
            onCycle={cyclePantry}
          />
          <ChipGroup
            heading="ของเฉพาะ"
            items={canonicalData.special}
            pantry={pantry}
            onCycle={cyclePantry}
          />
        </div>
      </details>

      {marketTokens.length > 0 && (
        <div className="mt-4 bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
          <p className="text-base font-semibold text-warm-900 dark:text-disc-text mb-2">🛒 ไปตลาด</p>
          <div className="flex flex-wrap gap-2">
            {marketTokens.map(token => (
              <span
                key={token}
                className="px-3 py-1 rounded-full text-sm bg-orange-500 text-white"
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
