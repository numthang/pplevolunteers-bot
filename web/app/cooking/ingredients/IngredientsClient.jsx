'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

// mirror ของ GROUP_OPTIONS ใน ../CookingClient.jsx — 5 หมวดเดียวกัน เคาะกับ user 2026-07-10
// (เก็บแยกไฟล์แทน import ข้ามเพื่อไม่ต้อง export เพิ่มจาก CookingClient.jsx)
const GROUP_OPTIONS = [
  { value: 'protein', label: 'โปรตีน' },
  { value: 'veg', label: 'ผักและผลไม้' },
  { value: 'starch', label: 'แป้งและธัญพืช' },
  { value: 'dairy', label: 'ไขมันและนม' },
  { value: 'seasoning', label: 'เครื่องปรุงและสมุนไพร' },
]

const INPUT_CLS =
  'w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'
const LABEL_CLS = 'text-sm font-medium text-warm-700 dark:text-disc-muted mb-1'

// ฟอร์มเพิ่ม/แก้ไขวัตถุดิบ — modal เดียวกับ pattern MenuForm.jsx (ห้ามแก้ไฟล์นั้น เลยทำแยกที่นี่ ฟอร์มเล็กแค่ 2 ช่อง)
function IngredientForm({ mode, item, onClose, onSaved }) {
  const [label, setLabel] = useState(item?.label || '')
  const [grp, setGrp] = useState(item?.grp || 'seasoning')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!label.trim()) {
      setError('ต้องมีชื่อวัตถุดิบ')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = mode === 'add' ? '/api/cooking/ingredients' : `/api/cooking/ingredients/${item.id}`
      const method = mode === 'add' ? 'POST' : 'PATCH'
      const body =
        mode === 'add'
          ? { token: label.trim(), label: label.trim(), grp }
          : { label: label.trim(), grp }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ')
        setSaving(false)
        return
      }
      onSaved(data.ingredient)
      onClose()
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">
            {mode === 'add' ? 'เพิ่มวัตถุดิบ' : 'แก้ไขวัตถุดิบ'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className={LABEL_CLS}>ชื่อวัตถุดิบ *</p>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className={INPUT_CLS}
              placeholder="เช่น ใบกะเพรา"
            />
          </div>

          <div>
            <p className={LABEL_CLS}>หมวด</p>
            <select value={grp} onChange={e => setGrp(e.target.value)} className={INPUT_CLS}>
              {GROUP_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2 transition"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-teal hover:opacity-90 text-white rounded-lg text-base font-medium px-4 py-2 transition disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function IngredientsClient() {
  const [loading, setLoading] = useState(true)
  const [ingredients, setIngredients] = useState([])
  const [menus, setMenus] = useState([]) // ใช้เช็คว่าวัตถุดิบที่จะลบเป็นเงื่อนไข (gates.key) ของเมนูไหนบ้าง
  const [formState, setFormState] = useState(null) // { mode: 'add'|'edit', item? }

  useEffect(() => {
    Promise.all([
      fetch('/api/cooking/ingredients').then(r => r.json()),
      fetch('/api/cooking/menus').then(r => r.json()),
    ])
      .then(([ingredientData, menuData]) => {
        setIngredients(ingredientData.ingredients || [])
        setMenus(menuData.menus || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleSaved(ingredient) {
    setIngredients(prev => {
      const exists = prev.some(i => i.id === ingredient.id)
      return exists ? prev.map(i => (i.id === ingredient.id ? ingredient : i)) : [...prev, ingredient]
    })
  }

  async function handleDelete(item) {
    // gates.key ผูกด้วย token ตรงๆ ไม่ใช่ FK — ลบแล้วเมนูที่ใช้ token นี้เป็นเงื่อนไขจะทำได้ไม่ได้อีกเลย (เงียบๆ)
    const usedBy = menus.filter(m => (m.gates?.key || []).includes(item.token))
    const warn = usedBy.length
      ? `\n\n"${item.label}" เป็นเงื่อนไขของเมนู: ${usedBy.map(m => m.name).join(', ')}\nลบแล้วเมนูนี้จะไม่มีวันขึ้นว่า "ทำได้" อีก จนกว่าจะเพิ่มของชื่อเดิมกลับมา`
      : ''
    if (!window.confirm(`ลบ "${item.label}" ?${warn}`)) return

    try {
      const res = await fetch(`/api/cooking/ingredients/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'ลบไม่สำเร็จ')
        return
      }
      setIngredients(prev => prev.filter(i => i.id !== item.id))
      // เคลียร์สถานะครัวของ token นี้ด้วย กันค้างเป็นขยะหลังลบจาก wiki
      fetch('/api/cooking/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: item.token, status: 'clear' }),
      }).catch(() => {})
    } catch {
      alert('ลบไม่สำเร็จ ลองใหม่อีกครั้ง')
    }
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
      <Link href="/cooking" className="text-sm text-teal hover:opacity-80">
        ← กลับหน้าครัว
      </Link>

      <div className="flex items-center justify-between gap-3 mt-2 mb-1">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">จัดการวัตถุดิบ</h1>
        <button
          type="button"
          onClick={() => setFormState({ mode: 'add' })}
          className="bg-teal hover:opacity-90 text-white rounded-lg text-sm font-medium px-4 py-2 transition whitespace-nowrap"
        >
          ＋ เพิ่มวัตถุดิบ
        </button>
      </div>

      <p className="text-sm text-warm-500 dark:text-disc-muted mb-4">
        {ingredients.length} รายการ — เป็น wiki กลาง ทุกคนเห็นเหมือนกันหมด (แก้/ลบต้อง login)
      </p>

      {GROUP_OPTIONS.map(o => {
        const items = ingredients.filter(i => i.grp === o.value)
        if (!items.length) return null
        return (
          <div key={o.value} className="mb-5">
            <p className="text-sm font-medium text-warm-500 dark:text-disc-muted mb-2">
              {o.label} ({items.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {items.map(i => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-2 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg px-3 py-2"
                >
                  <span className="text-base text-warm-900 dark:text-disc-text truncate">{i.label}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setFormState({ mode: 'edit', item: i })}
                      className="border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-md px-2.5 py-1 text-xs font-medium transition"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(i)}
                      className="border border-red-500 text-red-500 hover:bg-red-500 hover:text-white rounded-md px-2.5 py-1 text-xs font-medium transition"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {ingredients.length === 0 && (
        <p className="text-center text-sm text-warm-500 dark:text-disc-muted py-8">ยังไม่มีวัตถุดิบ</p>
      )}

      {formState && (
        <IngredientForm
          mode={formState.mode}
          item={formState.item}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
