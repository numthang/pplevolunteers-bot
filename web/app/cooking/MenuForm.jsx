'use client'
import { useEffect, useRef, useState } from 'react'
import { FOOD_GROUPS } from '@/lib/cookingConstants.js'

const CHIP_BASE =
  'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border transition'
const CHIP_ON = 'border-teal bg-teal text-white'
const CHIP_OFF =
  'border-warm-300 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'

const INPUT_CLS =
  'w-full h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'
const TEXTAREA_CLS =
  'w-full px-3 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal'
const LABEL_CLS = 'text-sm font-medium text-warm-700 dark:text-disc-muted mb-1'

function ToggleChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`}
    >
      {label}
    </button>
  )
}

function ChipMultiSelect({ label, helper, options, values, onChange }) {
  function toggle(token) {
    onChange(values.includes(token) ? values.filter(v => v !== token) : [...values, token])
  }
  return (
    <div>
      <p className={LABEL_CLS}>{label}</p>
      {helper && <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">{helper}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <ToggleChip
            key={o.token}
            label={o.label || o.token}
            active={values.includes(o.token)}
            onClick={() => toggle(o.token)}
          />
        ))}
      </div>
    </div>
  )
}

function TagInput({ label, helper, values, onChange, placeholder }) {
  const [text, setText] = useState('')
  function addTag() {
    const v = text.trim()
    if (!v || values.includes(v)) {
      setText('')
      return
    }
    onChange([...values, v])
    setText('')
  }
  return (
    <div>
      <p className={LABEL_CLS}>{label}</p>
      {helper && <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">{helper}</p>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {values.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-warm-100 dark:bg-disc-hover text-warm-900 dark:text-disc-text"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter(x => x !== v))}
                className="text-warm-400 dark:text-disc-muted hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addTag()
          }
        }}
        placeholder={placeholder}
        className={INPUT_CLS}
      />
    </div>
  )
}

// combobox multi-select: พิมพ์กรอง suggestions ที่ผ่านมา (autocomplete) + Enter/เลือกจาก dropdown เพื่อเพิ่ม
// พิมพ์ชื่อที่ไม่มีใน suggestions ก็เพิ่มเป็น tag ใหม่ได้เสมอ (free add) — dropdown ปิดเมื่อ blur/เลือกแล้ว
function ComboTagInput({ label, helper, values, onChange, suggestions = [], placeholder }) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef(null)

  useEffect(() => () => clearTimeout(blurTimer.current), [])

  const q = text.trim().toLowerCase()
  const filtered = q
    ? suggestions.filter(s => !values.includes(s) && s.toLowerCase().includes(q)).slice(0, 8)
    : []

  function addTag(raw) {
    const v = (raw ?? text).trim()
    if (!v || values.includes(v)) {
      setText('')
      setOpen(false)
      return
    }
    onChange([...values, v])
    setText('')
    setOpen(false)
  }

  function handleBlur() {
    // หน่วงปิด dropdown ให้ onMouseDown ของตัวเลือกทำงานก่อน (blur ยิงก่อน click ถ้าไม่หน่วง)
    blurTimer.current = setTimeout(() => setOpen(false), 150)
  }

  return (
    <div>
      <p className={LABEL_CLS}>{label}</p>
      {helper && <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">{helper}</p>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {values.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-warm-100 dark:bg-disc-hover text-warm-900 dark:text-disc-text"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter(x => x !== v))}
                className="text-warm-400 dark:text-disc-muted hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          type="text"
          value={text}
          onChange={e => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={placeholder}
          className={INPUT_CLS}
        />
        {open && filtered.length > 0 && (
          <div className="absolute left-0 right-0 mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
            {filtered.map(s => (
              <button
                key={s}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  addTag(s)
                }}
                className="w-full text-left px-3 py-2 text-sm text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function linesToArr(s) {
  return s.split('\n').map(x => x.trim()).filter(Boolean)
}

// textarea ที่ยืดสูงตามจำนวนบรรทัดเอง (ไม่ต้อง scroll ในกล่อง)
function AutoTextarea({ value, onChange, minRows = 2, ...props }) {
  const ref = useRef(null)
  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
  useEffect(() => {
    resize()
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={minRows}
      className={`${TEXTAREA_CLS} resize-none overflow-hidden`}
      {...props}
    />
  )
}

function SaveIndicator({ status }) {
  if (status === 'saving')
    return <span className="text-xs text-warm-400 dark:text-disc-muted">กำลังบันทึก...</span>
  if (status === 'saved') return <span className="text-xs text-teal">บันทึกแล้ว ✓</span>
  if (status === 'error') return <span className="text-xs text-red-500">บันทึกไม่สำเร็จ</span>
  return null
}

// menu (จาก API) → form state. image เป็น nested {emoji,url}, ingredients เป็น {core[],optional[]}
// core/optional เป็น array ตรงๆ แล้ว (ComboTagInput จัดการ) ไม่ผ่าน linesToArr เหมือน steps
// staples_used ไม่มี UI field แยก (ไม่ได้อยู่ใน spec) แต่ต้อง carry ผ่านไว้เฉยๆ กัน PATCH เขียนทับเป็น [] โดยไม่ตั้งใจ
function fromMenu(menu) {
  if (!menu) {
    return {
      name: '',
      emoji: '',
      imageUrl: '',
      method: '',
      cuisine: '',
      food_groups: [],
      protein: [],
      flavor: [],
      carb_in_dish: false,
      core: [],
      optional: [],
      steps: '',
      gatesProtein: [],
      gatesKey: [],
      staples_used: [],
    }
  }
  return {
    name: menu.name || '',
    emoji: menu.image?.emoji || '',
    imageUrl: menu.image?.url || '',
    method: menu.method || '',
    cuisine: menu.cuisine || '',
    food_groups: menu.food_groups || [],
    protein: menu.protein || [],
    flavor: menu.flavor || [],
    carb_in_dish: !!menu.carb_in_dish,
    core: menu.ingredients?.core || [],
    optional: menu.ingredients?.optional || [],
    steps: (menu.steps || []).join('\n'),
    gatesProtein: menu.gates?.protein || [],
    gatesKey: menu.gates?.key || [],
    staples_used: menu.staples_used || [],
  }
}

function buildPayload(f) {
  return {
    name: f.name.trim(),
    image: { emoji: f.emoji.trim() || null, url: f.imageUrl.trim() || null },
    method: f.method.trim() || null,
    cuisine: f.cuisine.trim() || null,
    food_groups: f.food_groups,
    protein: f.protein,
    flavor: f.flavor,
    carb_in_dish: f.carb_in_dish,
    ingredients: { core: f.core, optional: f.optional },
    staples_used: f.staples_used,
    steps: linesToArr(f.steps),
    gates: { protein: f.gatesProtein, key: f.gatesKey },
  }
}

// Autosave (แนว Notion) — ไม่มีปุ่มบันทึก ทุก field เปลี่ยนแล้วเซฟเอง
// add mode: ยังไม่มี id → เซฟครั้งแรก (เมื่อมีชื่อ) เป็น POST create แล้วสลับเป็น edit mode ในตัว (idRef)
// edit mode: PATCH ทุกครั้งที่เปลี่ยน
// idRef (ไม่ใช่ state) กัน stale closure ตอน recursive save จาก pendingRef — อ่านค่าล่าสุดเสมอ
export default function MenuForm({ mode, menu, onClose, onSaved }) {
  const [form, setForm] = useState(() => fromMenu(menu))
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [gating, setGating] = useState(false)
  // gates.protein options ดึงจาก wiki (cooking_ingredients grp='protein') แทน hardcode
  // เพิ่มโปรตีนใหม่ในหน้า /cooking/ingredients แล้วโผล่เป็นตัวเลือก gate อัตโนมัติ (ไม่ต้อง redeploy)
  const [proteinOptions, setProteinOptions] = useState([])
  const [ingredientLabels, setIngredientLabels] = useState([])
  const [flavorSuggestions, setFlavorSuggestions] = useState([])

  const idRef = useRef(menu?.id || null)
  const debounceTimer = useRef(null)
  const savingRef = useRef(false)
  const pendingRef = useRef(null)

  // ESC ปิด modal
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch('/api/cooking/ingredients')
      .then(res => (res.ok ? res.json() : { ingredients: [] }))
      .then(data => {
        if (cancelled) return
        const list = data.ingredients || []
        setProteinOptions(
          list.filter(i => i.grp === 'protein').map(i => ({ token: i.token, label: i.label }))
        )
        setIngredientLabels([...new Set(list.map(i => i.label).filter(Boolean))])
      })
      .catch(() => {})
    fetch('/api/cooking/menus')
      .then(res => (res.ok ? res.json() : { menus: [] }))
      .then(data => {
        if (cancelled) return
        const flavors = new Set()
        for (const m of data.menus || []) {
          for (const f of m.flavor || []) flavors.add(f)
        }
        setFlavorSuggestions([...flavors])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => clearTimeout(debounceTimer.current), [])

  // ปุ่มบันทึกแล้ว auto กลับเป็นเงียบหลังผ่านไปสักครู่ กันค้างบนจอ
  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => setSaveStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  async function runSave(nextForm) {
    savingRef.current = true
    setSaveStatus('saving')
    setError(null)
    try {
      const payload = buildPayload(nextForm)
      const isCreate = !idRef.current
      const url = isCreate ? '/api/cooking/menus' : `/api/cooking/menus/${idRef.current}`
      const method = isCreate ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ')
        setSaveStatus('error')
      } else {
        if (isCreate && data.menu?.id) idRef.current = data.menu.id
        setSaveStatus('saved')
        onSaved(data.menu)
      }
    } catch {
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง')
      setSaveStatus('error')
    } finally {
      savingRef.current = false
      if (pendingRef.current) {
        const next = pendingRef.current
        pendingRef.current = null
        runSave(next)
      }
    }
  }

  // ชื่อว่างห้ามเซฟ · ระหว่างมี save ค้างอยู่ ให้ queue เอาแค่ค่าล่าสุด (last-write-wins) ไม่ยิงซ้อน
  function requestSave(nextForm) {
    if (!nextForm.name.trim()) return
    if (savingRef.current) {
      pendingRef.current = nextForm
      return
    }
    runSave(nextForm)
  }

  // discrete: tag add/remove, chip toggle, อัพโหลดรูปสำเร็จ, ปุ่ม AI เติม → เซฟทันที
  function patchNow(patch) {
    setForm(prev => {
      const next = { ...prev, ...patch }
      requestSave(next)
      return next
    })
  }

  // continuous: พิมพ์ชื่อ/ขั้นตอน/URL รูป/emoji → debounce ~1000ms
  function patchDebounced(patch) {
    setForm(prev => {
      const next = { ...prev, ...patch }
      clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => requestSave(next), 1000)
      return next
    })
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/cooking/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'อัพโหลดรูปไม่สำเร็จ')
        return
      }
      patchNow({ imageUrl: data.url })
    } catch {
      setError('อัพโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setUploading(false)
    }
  }

  // ให้ AI เดา gates จากชื่อ + วัตถุดิบหลัก แล้วเติมลงช่อง + trigger autosave ทันที (มันเปลี่ยน form)
  async function suggestGates() {
    if (!form.name.trim()) {
      setError('ใส่ชื่อเมนูก่อน')
      return
    }
    setGating(true)
    setError(null)
    try {
      const res = await fetch('/api/cooking/gates-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), ingredients: form.core }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'เดา gates ไม่สำเร็จ')
        return
      }
      patchNow({
        food_groups: data.food_groups?.length ? data.food_groups : form.food_groups,
        flavor: data.flavor?.length ? data.flavor : form.flavor,
        gatesProtein: data.protein || [],
        gatesKey: data.key || [],
      })
    } catch {
      setError('เดา gates ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setGating(false)
    }
  }

  const noGates = form.gatesProtein.length === 0 && form.gatesKey.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">
            {mode === 'add' ? 'เพิ่มเมนูใหม่' : 'แก้ไขเมนู'}
          </h2>
          <div className="flex items-center gap-3">
            <SaveIndicator status={saveStatus} />
            <button
              type="button"
              onClick={onClose}
              className="text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text text-xl leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={e => e.preventDefault()} className="space-y-4">
          <div>
            <p className={LABEL_CLS}>ชื่อเมนู *</p>
            <input
              type="text"
              value={form.name}
              onChange={e => patchDebounced({ name: e.target.value })}
              className={INPUT_CLS}
              placeholder="เช่น ผัดกะเพราหมูสับ"
            />
          </div>

          <div className="flex gap-3">
            <div className="w-20 shrink-0">
              <p className={LABEL_CLS}>อีโมจิ</p>
              <input
                type="text"
                value={form.emoji}
                onChange={e => patchDebounced({ emoji: e.target.value })}
                maxLength={4}
                className={`${INPUT_CLS} text-center text-xl`}
                placeholder="🍛"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className={LABEL_CLS}>ลิงก์รูป (ไม่บังคับ)</p>
              <input
                type="text"
                value={form.imageUrl}
                onChange={e => patchDebounced({ imageUrl: e.target.value })}
                className={INPUT_CLS}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {form.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.imageUrl}
                alt="ตัวอย่างรูปเมนู"
                className="w-24 h-24 object-cover rounded-lg border border-warm-200 dark:border-disc-border shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className={LABEL_CLS}>อัพโหลดรูปจากเครื่อง</p>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileUpload}
                disabled={uploading}
                className="text-sm text-warm-700 dark:text-disc-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal file:text-white hover:file:opacity-90 disabled:opacity-50"
              />
              {uploading && (
                <p className="text-xs text-warm-400 dark:text-disc-muted mt-1">กำลังอัพโหลด...</p>
              )}
            </div>
          </div>

          <ComboTagInput
            label="วัตถุดิบหลัก"
            helper="พิมพ์เพื่อค้นจากคลังวัตถุดิบ หรือพิมพ์ชื่อใหม่แล้ว Enter"
            values={form.core}
            onChange={v => patchNow({ core: v })}
            suggestions={ingredientLabels}
            placeholder="เช่น หมูสับ, ใบกะเพรา, พริก"
          />

          <ComboTagInput
            label="วัตถุดิบเสริม"
            helper="ไม่บังคับ"
            values={form.optional}
            onChange={v => patchNow({ optional: v })}
            suggestions={ingredientLabels}
            placeholder="พิมพ์แล้ว Enter"
          />

          <div>
            <p className={LABEL_CLS}>ขั้นตอน</p>
            <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">หนึ่งบรรทัดต่อหนึ่งขั้นตอน</p>
            <AutoTextarea
              value={form.steps}
              onChange={e => patchDebounced({ steps: e.target.value })}
              minRows={4}
              placeholder={'ตำกระเทียมพริก\nผัดหมูสับ\nใส่ใบกะเพรา'}
            />
          </div>

          <details className="border-t border-warm-200 dark:border-disc-border pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-warm-900 dark:text-disc-text select-none">
              ข้อมูลระบบสุ่ม (หมู่อาหาร · รสชาติ · gates)
              {noGates && <span className="text-orange-500 font-normal"> — ⚠️ ยังไม่มี gates</span>}
            </summary>
            <div className="flex items-center justify-between gap-2 mt-3 mb-4">
              <p className="text-xs text-warm-400 dark:text-disc-muted">
                ปกติไม่ต้องแตะเอง — กด AI เติมให้ หรือแก้เองก็ได้
              </p>
              <button
                type="button"
                onClick={suggestGates}
                disabled={gating}
                className="shrink-0 text-xs border border-teal text-teal rounded-lg px-2.5 py-1 font-medium hover:bg-teal hover:text-white transition disabled:opacity-50"
              >
                {gating ? 'กำลังเดา...' : '🤖 ให้ AI เติมทั้งหมด'}
              </button>
            </div>

            <div className="mb-4">
              <ChipMultiSelect
                label="หมู่อาหาร"
                options={FOOD_GROUPS}
                values={form.food_groups}
                onChange={v => patchNow({ food_groups: v })}
              />
            </div>

            <div className="mb-4">
              <ComboTagInput
                label="รสชาติ"
                values={form.flavor}
                onChange={v => patchNow({ flavor: v })}
                suggestions={flavorSuggestions}
                placeholder="พิมพ์แล้วกด Enter เช่น เผ็ด, เค็ม"
              />
            </div>

            <p className="text-sm font-semibold text-warm-900 dark:text-disc-text mb-2">
              เงื่อนไขวัตถุดิบ (gates) — สำคัญที่สุด
            </p>

            <div className="mb-4">
              <ChipMultiSelect
                label="โปรตีนที่ใช้ตัดสิน"
                helper="ต้องมีอย่างน้อย 1 ตัวถึงจะถูกสุ่มเจอ"
                options={proteinOptions}
                values={form.gatesProtein}
                onChange={v => patchNow({ gatesProtein: v })}
              />
            </div>

            <TagInput
              label="ของเฉพาะที่ขาดไม่ได้"
              helper="0-3 อย่าง เช่น ใบกะเพรา, กะทิ"
              values={form.gatesKey}
              onChange={v => patchNow({ gatesKey: v })}
              placeholder="พิมพ์แล้วกด Enter"
            />

            {noGates && (
              <p className="text-sm text-orange-500 mt-2">
                ⚠️ เมนูนี้จะถือว่าทำได้เสมอ (ไม่มีเงื่อนไขวัตถุดิบ)
              </p>
            )}
          </details>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2 transition"
            >
              ปิด
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
