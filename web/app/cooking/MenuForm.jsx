'use client'
import { useEffect, useRef, useState } from 'react'

const FOOD_GROUPS = [
  { token: 'protein', label: 'โปรตีน' },
  { token: 'veg', label: 'ผัก' },
  { token: 'carb', label: 'คาร์บ' },
  { token: 'dessert', label: 'ของหวาน' },
  { token: 'drink', label: 'เครื่องดื่ม' },
]

// gates.protein enum คงที่ (matcher หลักผูกกับชุดนี้ตรงๆ — ดู PROTEIN_ENUM ใน api/cooking/import/route.js)
// เดิมเคยดึงจาก canonical.json.protein แต่ไฟล์นั้นถูกยกเลิกแล้ว (ingredients ทั้งหมดย้ายเข้า DB wiki)
const PROTEIN_ENUM_OPTIONS = [
  { token: 'pork', label: 'หมู' },
  { token: 'chicken', label: 'ไก่' },
  { token: 'beef', label: 'เนื้อวัว' },
  { token: 'shrimp', label: 'กุ้ง' },
  { token: 'squid', label: 'ปลาหมึก' },
  { token: 'fish', label: 'ปลา' },
  { token: 'tofu', label: 'เต้าหู้' },
]

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

// menu (จาก API) → form state. image เป็น nested {emoji,url}, ingredients เป็น {core[],optional[]}
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
      core: '',
      optional: '',
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
    core: (menu.ingredients?.core || []).join('\n'),
    optional: (menu.ingredients?.optional || []).join('\n'),
    steps: (menu.steps || []).join('\n'),
    gatesProtein: menu.gates?.protein || [],
    gatesKey: menu.gates?.key || [],
    staples_used: menu.staples_used || [],
  }
}

export default function MenuForm({ mode, menu, onClose, onSaved }) {
  const [form, setForm] = useState(() => fromMenu(menu))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [gating, setGating] = useState(false)

  // ESC ปิด modal
  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  function set(patch) {
    setForm(prev => ({ ...prev, ...patch }))
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
      set({ imageUrl: data.url })
    } catch {
      setError('อัพโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setUploading(false)
    }
  }

  // ให้ AI เดา gates จากชื่อ + วัตถุดิบหลัก แล้วเติมลงช่อง (ยังไม่ save — ผู้ใช้ตรวจ/กดบันทึกเอง)
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
        body: JSON.stringify({ name: form.name.trim(), ingredients: linesToArr(form.core) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'เดา gates ไม่สำเร็จ')
        return
      }
      set({ gatesProtein: data.protein || [], gatesKey: data.key || [] })
    } catch {
      setError('เดา gates ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setGating(false)
    }
  }

  const noGates = form.gatesProtein.length === 0 && form.gatesKey.length === 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('ต้องมีชื่อเมนู')
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      image: { emoji: form.emoji.trim() || null, url: form.imageUrl.trim() || null },
      method: form.method.trim() || null,
      cuisine: form.cuisine.trim() || null,
      food_groups: form.food_groups,
      protein: form.protein,
      flavor: form.flavor,
      carb_in_dish: form.carb_in_dish,
      ingredients: { core: linesToArr(form.core), optional: linesToArr(form.optional) },
      staples_used: form.staples_used,
      steps: linesToArr(form.steps),
      gates: { protein: form.gatesProtein, key: form.gatesKey },
    }

    try {
      const url = mode === 'add' ? '/api/cooking/menus' : `/api/cooking/menus/${menu.id}`
      const method = mode === 'add' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'บันทึกไม่สำเร็จ')
        setSaving(false)
        return
      }
      onSaved(data.menu)
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
        className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">
            {mode === 'add' ? 'เพิ่มเมนูใหม่' : 'แก้ไขเมนู'}
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
            <p className={LABEL_CLS}>ชื่อเมนู *</p>
            <input
              type="text"
              value={form.name}
              onChange={e => set({ name: e.target.value })}
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
                onChange={e => set({ emoji: e.target.value })}
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
                onChange={e => set({ imageUrl: e.target.value })}
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

          <ChipMultiSelect
            label="หมู่อาหาร"
            options={FOOD_GROUPS}
            values={form.food_groups}
            onChange={v => set({ food_groups: v })}
          />

          <TagInput
            label="รสชาติ"
            values={form.flavor}
            onChange={v => set({ flavor: v })}
            placeholder="พิมพ์แล้วกด Enter เช่น เผ็ด, เค็ม"
          />

          <div>
            <p className={LABEL_CLS}>วัตถุดิบหลัก</p>
            <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">หนึ่งบรรทัดต่อหนึ่งรายการ</p>
            <AutoTextarea
              value={form.core}
              onChange={e => set({ core: e.target.value })}
              minRows={3}
              placeholder={'หมูสับ\nใบกะเพรา\nพริก'}
            />
          </div>

          <div>
            <p className={LABEL_CLS}>วัตถุดิบเสริม</p>
            <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">
              หนึ่งบรรทัดต่อหนึ่งรายการ (ไม่บังคับ)
            </p>
            <AutoTextarea value={form.optional} onChange={e => set({ optional: e.target.value })} minRows={2} />
          </div>

          <div>
            <p className={LABEL_CLS}>ขั้นตอน</p>
            <p className="text-xs text-warm-400 dark:text-disc-muted mb-2">หนึ่งบรรทัดต่อหนึ่งขั้นตอน</p>
            <AutoTextarea
              value={form.steps}
              onChange={e => set({ steps: e.target.value })}
              minRows={4}
              placeholder={'ตำกระเทียมพริก\nผัดหมูสับ\nใส่ใบกะเพรา'}
            />
          </div>

          <div className="border-t border-warm-200 dark:border-disc-border pt-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-warm-900 dark:text-disc-text">
                เงื่อนไขวัตถุดิบ (gates) — สำคัญที่สุด
              </p>
              <button
                type="button"
                onClick={suggestGates}
                disabled={gating}
                className="shrink-0 text-xs border border-teal text-teal rounded-lg px-2.5 py-1 font-medium hover:bg-teal hover:text-white transition disabled:opacity-50"
              >
                {gating ? 'กำลังเดา...' : '🤖 ให้ AI เติม'}
              </button>
            </div>

            <div className="mb-4">
              <ChipMultiSelect
                label="โปรตีนที่ใช้ตัดสิน"
                helper="ต้องมีอย่างน้อย 1 ตัวถึงจะถูกสุ่มเจอ"
                options={PROTEIN_ENUM_OPTIONS}
                values={form.gatesProtein}
                onChange={v => set({ gatesProtein: v })}
              />
            </div>

            <TagInput
              label="ของเฉพาะที่ขาดไม่ได้"
              helper="0-3 อย่าง เช่น ใบกะเพรา, กะทิ"
              values={form.gatesKey}
              onChange={v => set({ gatesKey: v })}
              placeholder="พิมพ์แล้วกด Enter"
            />

            {noGates && (
              <p className="text-sm text-orange-500 mt-2">
                ⚠️ เมนูนี้จะถือว่าทำได้เสมอ (ไม่มีเงื่อนไขวัตถุดิบ)
              </p>
            )}
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
