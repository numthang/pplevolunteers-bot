'use client'

/**
 * TagCombobox — ตัวเลือกของ select/multi_select field (ตรงสกรีนช็อตที่ user ส่งมา 2026-08-18 รอบเย็น)
 *
 * จัดการตัวเลือกทั้งหมด (สร้าง/เปลี่ยนชื่อ/สี/ลบถาวร/จัดลำดับ) จาก**ในกล่องนี้เลย** — ไม่มีหน้าแอดมินแยก
 *
 * ⚠️ options (ตัวเลือกทั้งหมดของ field) กับ value (ที่การ์ดใบนี้เลือกไว้) เป็นคนละชุดข้อมูล —
 *    ต้องยิง GET แยกตอนเปิดกล่องครั้งแรก การ์ด AGG คืนมาแค่ตัวที่เลือกไว้เท่านั้น
 *
 * ⛔ 3 กับดักที่เคยพลาดมาแล้วรอบแรก (Opus ตรวจเจอ 2026-08-18 · ห้ามทำซ้ำ):
 *   1. **เมนูแก้ตัวเลือกห้ามเป็น popover ลอย** — เดิมเป็น `absolute left-full` งอกออกนอกจอทั้ง desktop
 *      (y=819 บนจอ 720) และมือถือ (y=913 บนจอ 844) = ปุ่มลบกดไม่ได้เลย · ตอนนี้เป็น **inline expand**
 *      ไหลอยู่ใน scroll container ปกติ เลื่อนถึงได้เสมอ ไม่ว่าจอสูงเท่าไหร่
 *   2. **ต้องมี local `selected` + `seq` guard** — เดิมอ่าน selectedIds จาก prop ตรงๆ ทุก render
 *      กดเลือกรัวๆ 3 อัน = อันหลังทับอันหน้า เหลืออันเดียว (lost update)
 *      บทเรียนเดียวกับ LabelPicker.jsx ที่แก้ไปแล้ว — คราวนี้ลอกมาให้ครบ
 *   3. **ทุก fetch ต้องรายงาน error** — เดิม `if (!res.ok) return` เงียบหมด
 *      เคสร้ายสุด: rename ชนชื่อซ้ำ → 409 → ช่องยังโชว์ชื่อใหม่ทั้งที่ DB ไม่รับ = UI โกหก
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff, GripVertical, Loader2, MoreHorizontal, Trash2, X } from 'lucide-react'
import { chipProps, LABEL_PALETTE } from '@/lib/kanbanLabelColors.js'
// ⛔ ห้ามยิง /api/kanban/fields/../options เองที่นี่ — ทุกอย่างผ่าน lib ตัวนี้
//    เช็คลิสต์ใช้ตัวเดียวกัน (user เคาะ: พฤติกรรมต้องเหมือน select เป๊ะ)
import * as optionAPI from '@/lib/kanbanOptionActions.js'

/**
 * แถวแก้ตัวเลือก — กางอยู่ในแถวเดิม ไม่ลอยออกนอกกล่อง (กับดักข้อ 1)
 *
 * ⭐ export ออกไปให้ ChecklistFieldBox ใช้ตัวเดียวกัน — user เคาะ 2026-08-19 ค่ำว่าเช็คลิสต์ต้อง
 *    "เอาเหมือน select เลย พฤติกรรม" · ลอก markup ไปวางซ้ำเมื่อไหร่ = 2 ที่ที่ดริฟต์ออกจากกันแน่นอน
 */
export function OptionEditor({ option, t, onSave, onDelete, onArchive, busy }) {
  const [name, setName] = useState(option.name)
  const ref = useRef(null)

  useEffect(() => { setName(option.name) }, [option.name])
  // กางแล้วเลื่อนให้เห็นเต็มเสมอ — กล่องอาจอยู่ติดขอบล่างจออยู่แล้ว
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }) }, [])

  // ⚠️ ต้องรอผลจริงแล้วเด้งกลับถ้าไม่ผ่าน — `option.name` ไม่เปลี่ยนตอน server ปฏิเสธ
  //    useEffect ที่เฝ้า option.name เลยไม่ทำงาน = ช่องค้างโชว์ชื่อที่ DB ไม่เคยรับ (UI โกหก)
  const commitName = async () => {
    const clean = name.trim()
    if (!clean) { setName(option.name); return }
    if (clean === option.name) return
    const ok = await onSave({ name: clean })
    if (!ok) setName(option.name)
  }

  return (
    <div ref={ref} className="ml-6 mr-1 mb-1 p-2 rounded-lg border border-warm-200 dark:border-disc-border flex flex-col gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') { setName(option.name); e.currentTarget.blur() }
        }}
        maxLength={60}
        className="w-full h-9 px-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
      />
      <div>
        <p className="text-xs text-warm-400 dark:text-disc-muted mb-1">{t('modal.optionColorLabel')}</p>
        <div className="flex flex-wrap gap-1.5">
          {LABEL_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onSave({ color: hex })}
              style={{ background: hex }}
              aria-label={hex}
              className={`w-7 h-7 rounded-full border ${option.color === hex ? 'ring-2 ring-teal border-transparent' : 'border-warm-200 dark:border-disc-border'}`}
            />
          ))}
        </div>
      </div>
      {/* 2 ปุ่มคู่กันเสมอ — "ซ่อน" คือทางเลือกที่กู้ได้ ต้องเห็นพร้อมกับ "ลบถาวร" ไม่งั้นคนกดลบเพราะไม่รู้ว่ามีอีกทาง */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => onArchive(!option.archived_at)}
          className="flex items-center gap-1.5 w-fit text-sm text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text font-medium"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : (option.archived_at ? <Eye size={14} /> : <EyeOff size={14} />)}
          {option.archived_at ? t('modal.optionRestore') : t('modal.optionHide')}
        </button>
        {!option.archived_at && (
          <p className="text-xs text-warm-400 dark:text-disc-muted">{t('modal.optionHiddenHint')}</p>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1.5 w-fit text-sm text-red-500 hover:text-red-600 font-medium"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {t('modal.optionDelete')}
        </button>
      </div>
    </div>
  )
}

/**
 * @param {object} p
 * @param {{mode:'field'}|{mode:'static',options:Array}|{mode:'search',search:(q:string)=>Promise<Array>}} [p.source]
 *   - `field` (ค่าตั้งต้น) — ตัวเลือกมาจาก kanban_field_options · สร้าง/เปลี่ยนชื่อ/ลบ/ลากได้ **เส้นเดิม ห้ามแตะ**
 *   - `static` — ตัวเลือกตายตัวจากระบบ (เช่น สถานะ 6 แบบ) · แก้ตัวเลือกไม่ได้
 *   - `search` — ค้นตามที่พิมพ์ (เช่น คนใน org) · แก้ตัวเลือกไม่ได้
 *     ⚠️ ต้องเป็น search ไม่ใช่โหลดมาก่อน — org 1 มีสมาชิก 7,376 คน (ดู api/kanban/people)
 * @param {boolean} [p.numericIds=true] id เป็นตัวเลขไหม — สถานะใช้สตริง ('backlog') ต้องปิด
 */
export default function TagCombobox({
  fieldId, type, value = [], readOnly, onCommit, onError, t,
  source = { mode: 'field' }, numericIds = true, placeholder,
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(null)   // null = ยังไม่โหลด
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyOpt, setBusyOpt] = useState(null)
  const [editFor, setEditFor] = useState(null)
  const [dragId, setDragId] = useState(null)
  const boxRef = useRef(null)
  const popRef = useRef(null)
  // แก้ตัวเลือกได้เฉพาะ custom field จริงๆ — สถานะ/คนใน org เป็นของระบบ ห้ามสร้าง/เปลี่ยนชื่อ/ลบ
  const canManageOptions = source.mode === 'field'

  // ⭐ ชุดที่เลือกอยู่เก็บเป็น state ของตัวเอง ไม่อ่านจาก prop ตรงๆ (กับดักข้อ 2)
  //    ไม่งั้นกดรัวๆ แต่ละครั้งจะ snapshot ค่าเดิมที่ยังไม่ทันอัปเดตจาก server = ทับกันเอง
  const [selected, setSelected] = useState(() => new Set(value.map((v) => String(v.id))))
  const seq = useRef(0)
  const inflight = useRef(0)

  // ค่าจาก server เปลี่ยน (โหลดใหม่/คนอื่นแก้) → sync — แต่ห้ามทับตอนที่คำขอของเราเองยังบินอยู่
  useEffect(() => {
    if (inflight.current > 0) return
    setSelected(new Set(value.map((v) => String(v.id))))
  }, [value])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setEditFor(null) }
    }
    function onKey(e) { if (e.key === 'Escape') { setOpen(false); setEditFor(null) } }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // เปิดแล้วเลื่อนให้เห็นทั้งกล่อง — trigger มักอยู่ท้าย modal ทำให้ dropdown ตกขอบล่าง
  useEffect(() => {
    if (open) popRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  async function loadOptions(q = '') {
    if (source.mode === 'static') { setOptions(source.options || []); return }
    if (source.mode === 'search') {
      setLoading(true)
      try { setOptions(await source.search(q)) }
      catch { onError?.(t('loadFailed')); setOptions([]) }
      finally { setLoading(false) }
      return
    }
    setLoading(true)
    try {
      // archived=1 — ต้องเห็นตัวที่ซ่อนไว้ถึงจะกด "เอากลับ" ได้ · กรองออกจากรายการให้เลือกที่ฝั่งนี้แทน
      const list = await optionAPI.fetchOptions(fieldId, { archived: true })
      if (!list) { onError?.(t('loadFailed')); setOptions([]); return }
      setOptions(list)
    } catch {
      onError?.(t('loadFailed'))
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  function openBox() {
    if (readOnly) return
    setOpen(true)
    if (options === null || source.mode === 'search') loadOptions(query)
  }

  // โหมด search — พิมพ์แล้วยิงค้นใหม่ (หน่วงไว้ ไม่งั้นยิงทุกตัวอักษร)
  useEffect(() => {
    if (!open || source.mode !== 'search') return
    const timer = setTimeout(() => loadOptions(query), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, source.mode])

  /** ส่งชุดใหม่ให้ server · optimistic ไว้ก่อนเพื่อให้กดรัวได้ · คำตอบเก่ากว่าคำขอล่าสุด = ทิ้ง */
  async function commitSet(next) {
    setSelected(new Set(next))
    const mine = ++seq.current
    inflight.current++
    try {
      await onCommit(numericIds ? [...next].map(Number) : [...next])
    } finally {
      inflight.current--
      // คำขอที่ใหม่กว่าตามมาแล้ว ปล่อยให้ตัวนั้นเป็นคนตัดสินผลสุดท้าย
      if (mine === seq.current && inflight.current === 0) {
        // ไม่ต้องทำอะไร — useEffect ที่เฝ้า value จะ sync ให้เองรอบถัดไป
      }
    }
  }

  function toggleOption(optId) {
    const id = String(optId)
    if (type === 'select') {
      commitSet(selected.has(id) ? [] : [id])
      setOpen(false)
      return
    }
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    commitSet(next)
  }

  async function createOption() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}/options`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.option) { onError?.(json.error || t('modal.optionCreateFailed')); return }
      setOptions((prev) => {
        const list = prev || []
        return list.some((o) => String(o.id) === String(json.option.id)) ? list : [...list, json.option]
      })
      setQuery('')
      // ติดให้การ์ดทันที — ต่อจากชุดที่เลือกอยู่จริง ไม่ใช่จาก prop ที่ยังไม่อัปเดต
      const next = type === 'select' ? new Set([String(json.option.id)]) : new Set(selected).add(String(json.option.id))
      commitSet(next)
    } catch {
      onError?.(t('modal.optionCreateFailed'))
    } finally {
      setCreating(false)
    }
  }

  /** @returns {Promise<boolean>} สำเร็จไหม — ตัวเรียกใช้เด้งค่าเดิมกลับเองถ้า false */
  async function saveOption(optId, patch) {
    setBusyOpt(optId)
    const res = await optionAPI.patchOption(fieldId, optId, patch)
    setBusyOpt(null)
    // ⚠️ 409 = ชื่อซ้ำ · ต้องบอก + คืน false ให้ช่องเด้งกลับ ไม่งั้นโชว์ชื่อที่ DB ไม่เคยรับ (UI โกหก)
    if (!res.ok) {
      onError?.(res.status === 409 ? t('modal.optionDuplicate') : (res.error || t('saveFailed')))
      return false
    }
    setOptions((prev) => (prev || []).map((o) => (String(o.id) === String(optId) ? res.option : o)))
    return true
  }

  /** ซ่อน / เอากลับ — ไม่ต้องถามยืนยัน เพราะกดคืนได้ทันทีในกล่องเดียวกัน */
  async function archiveOption(optId, archived) {
    setBusyOpt(optId)
    const res = await optionAPI.setOptionArchived(fieldId, optId, archived)
    if (!res.ok) onError?.(res.error || t('saveFailed'))
    // ซ่อนตัวที่การ์ดใบนี้ติดอยู่ → ชิปยังอยู่ (ตั้งใจ) แค่ไม่ถูกเสนอให้ใบอื่นเลือกใหม่
    else setOptions((prev) => (prev || []).map((o) => (String(o.id) === String(optId) ? res.option : o)))
    setBusyOpt(null)
  }

  /**
   * ลบตัวเลือกถาวร — **ลบจริง ไม่ใช่ซ่อน** (กลับคำ 2026-08-18)
   * เดิมยิง PATCH { archived: true } ซึ่งได้ผลเหมือนลบอยู่แล้ว (ชิปหายจากทุกการ์ด)
   * แต่ทิ้งแถวตายที่มองไม่เห็นและเอากลับไม่ได้ไว้ใน DB — user: "จะมีขยะเต็มไปหมด"
   *
   * ⚠️ ถามก่อนเสมอ และ**ต้องบอกจำนวนการ์ดที่ใช้อยู่จริง** — ตัวเลขคือกลไกกันพลาด
   *    แทนการจำกัดสิทธิ์ (ตรงนี้ไม่มี gate ยศ ใครแก้การ์ดได้ก็ลบได้)
   */
  async function deleteOption(optId) {
    const opt = (options || []).find((o) => String(o.id) === String(optId))
    const name = opt?.name || ''

    setBusyOpt(optId)
    const outcome = await optionAPI.deleteOptionWithConfirm(fieldId, optId, { name, t, onError })
    setBusyOpt(null)
    if (outcome !== 'deleted') return

    setOptions((prev) => (prev || []).filter((o) => String(o.id) !== String(optId)))
    setEditFor(null)
    if (selected.has(String(optId))) {
      const next = new Set(selected)
      next.delete(String(optId))
      commitSet(next)
    }
  }

  async function onDropReorder(targetId) {
    if (!dragId || String(dragId) === String(targetId)) { setDragId(null); return }
    const list = [...(options || [])]
    const from = list.findIndex((o) => String(o.id) === String(dragId))
    const to = list.findIndex((o) => String(o.id) === String(targetId))
    if (from === -1 || to === -1) { setDragId(null); return }
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    const before = options
    setOptions(list)
    setDragId(null)
    try {
      const res = await fetch(`/api/kanban/fields/${fieldId}/options`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorder: list.map((o) => o.id) }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        onError?.(json.error || t('saveFailed'))
        setOptions(before)          // ลำดับใหม่ไม่ติด = คืนของเดิม ไม่ให้ UI โชว์ลำดับที่ DB ไม่มี
      }
    } catch {
      onError?.(t('saveFailed'))
      setOptions(before)
    }
  }

  const q = query.trim().toLowerCase()
  // โหมด search — server กรองมาแล้ว กรองซ้ำฝั่งนี้จะตัดผลที่ตรงแบบอื่น (ชื่อเล่น/ชื่อจริง) ทิ้ง
  const matched = source.mode === 'search' ? (options || []) : (options || []).filter((o) => o.name.toLowerCase().includes(q))
  // ⭐ ตัวที่ซ่อนไว้แยกไปกองล่าง — ไม่เสนอให้เลือกใหม่ แต่ต้องเห็นเพื่อกด "เอากลับ"
  const filtered = matched.filter((o) => !o.archived_at)
  const hidden = matched.filter((o) => o.archived_at)
  // ⚠️ เช็คชื่อซ้ำจาก options ทั้งชุด (รวมที่ซ่อน) — unique index ไม่สนว่าซ่อนอยู่ไหม
  //    ไม่งั้นกดสร้างแล้วเด้ง 409 โดยไม่มีอะไรให้เห็นบนจอว่าชนกับตัวไหน
  const exactMatch = (options || []).some((o) => o.name.trim().toLowerCase() === q)
  // ชิปที่โชว์บนปุ่ม — ยึด selected (ของเราเอง) แล้วหาข้อมูลชื่อ/สีจาก value+options
  const known = new Map([...(value || []), ...(options || [])].map((o) => [String(o.id), o]))
  const shownChips = [...selected].map((id) => known.get(id)).filter(Boolean)

  return (
    <div ref={boxRef} className="relative">
      {/*
        ⚠️ เป็น div ไม่ใช่ button — ข้างในมีปุ่ม × ของแต่ละชิป (button ซ้อน button = HTML ผิด เบราว์เซอร์แก้โครงเอง)
        ปุ่ม × อยู่บนชิปตรงนี้เลย ตาม screenshot ที่ user ส่งมา — **ไม่มีชุดชิปให้ลบซ้ำข้างล่างอีกชุด**
      */}
      <div
        role={readOnly ? undefined : 'button'}
        tabIndex={readOnly ? undefined : 0}
        onClick={openBox}
        onKeyDown={(e) => { if (!readOnly && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openBox() } }}
        className={`w-full min-h-11 px-2 -mx-2 py-1.5 flex flex-wrap items-center gap-1.5 text-base rounded-lg border border-transparent bg-transparent text-left transition ${
          readOnly ? 'opacity-60' : 'hover:bg-warm-50 dark:hover:bg-disc-hover cursor-pointer'
        }`}
      >
        {shownChips.length === 0 && <span className="text-warm-400 dark:text-disc-muted">{placeholder || t('modal.tagPlaceholder')}</span>}
        {shownChips.map((v) => {
          const tint = chipProps(v)
          return (
            // ⛔ ห้ามใส่ truncate / max-w-full ตรงนี้ — user สั่งชัด 2026-08-19: "ต้องแสดงให้หมด ไม่ใช่แก้ด้วยการ truncate"
            //    เคยใส่แล้วพัง: truncate มี overflow:hidden → flex item ย่อได้ถึง 0 → ชิปเหลือแต่ปุ่ม × ไม่มีตัวหนังสือเลย
            // whitespace-nowrap อย่างเดียวพอ: ชื่อที่มีเว้นวรรคจะไม่หักกลางชิป ชิปที่ไม่พอที่ก็ตกไปบรรทัดใหม่ทั้งใบ
            //    (กล่องข้างนอกเป็น flex-wrap อยู่แล้ว)
            <span key={v.id} style={tint.style} title={v.name} className={`inline-flex items-center gap-1 pl-2.5 ${readOnly ? 'pr-2.5' : 'pr-1'} py-0.5 text-sm font-medium rounded-md whitespace-nowrap ${tint.className}`}>
              {v.name}
              {!readOnly && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleOption(v.id) }}
                  aria-label={t('modal.optionUnselect')}
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )
        })}
      </div>

      {open && (
        <div ref={popRef} className="mt-1 w-full bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (canManageOptions && e.key === 'Enter' && !exactMatch && query.trim()) { e.preventDefault(); createOption() } }}
            placeholder={t('modal.tagSearchPlaceholder')}
            className="w-full h-9 px-2 mb-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
          />
          {canManageOptions && <p className="text-xs text-warm-400 dark:text-disc-muted px-1 mb-1">{t('modal.tagHint')}</p>}
          {/* โหมดค้นคน — บอกให้พิมพ์ก่อน ไม่งั้นเปิดมาเจอรายการว่างแล้วงง (API ต้อง ≥2 ตัวอักษร) */}
          {source.mode === 'search' && !loading && !(options || []).length && (
            <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-2">{t('modal.searchPeopleHint')}</p>
          )}

          {loading && <p className="text-sm text-warm-400 dark:text-disc-muted px-1 py-2">{t('loading')}</p>}

          <div className="max-h-72 overflow-y-auto flex flex-col gap-0.5">
            {!loading && filtered.map((o) => {
              const on = selected.has(String(o.id))
              const tint = chipProps(o)
              return (
                <div key={o.id}>
                  <div
                    className="flex items-center gap-1.5 px-1 py-1 rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover"
                    draggable={canManageOptions && !q}
                    onDragStart={() => canManageOptions && setDragId(o.id)}
                    onDragOver={(e) => { if (canManageOptions) e.preventDefault() }}
                    onDrop={() => canManageOptions && onDropReorder(o.id)}
                  >
                    {canManageOptions && <GripVertical size={14} className="text-warm-300 dark:text-disc-muted cursor-grab shrink-0" />}
                    <button type="button" onClick={() => toggleOption(o.id)} className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
                      <span style={tint.style} className={`px-2.5 py-0.5 text-sm font-medium rounded-md ${tint.className}`}>
                        {o.name}
                      </span>
                      {/* บรรทัดรอง — โหมด search ใช้แยกคนชื่อซ้ำ (@username) · ชิปที่ติดการ์ดไม่เอาไปด้วย */}
                      {o.sub && (
                        <span className="text-xs text-warm-400 dark:text-disc-muted">{o.sub}</span>
                      )}
                    </button>
                    {on && <Check size={16} className="text-teal shrink-0" />}
                    {busyOpt === o.id && <Loader2 size={14} className="animate-spin text-warm-400 dark:text-disc-muted shrink-0" />}
                    {canManageOptions && (
                      <button
                        type="button"
                        onClick={() => setEditFor(editFor === o.id ? null : o.id)}
                        aria-label={t('modal.optionEdit')}
                        title={t('modal.optionEdit')}
                        className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text shrink-0"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )}
                  </div>

                  {/* กางในแถวเดิม ไม่ลอยออกนอกกล่อง — เลื่อนถึงได้ทุกจอ (กับดักข้อ 1) */}
                  {canManageOptions && editFor === o.id && (
                    <OptionEditor
                      option={o}
                      t={t}
                      busy={busyOpt === o.id}
                      onSave={(patch) => saveOption(o.id, patch)}
                      onDelete={() => deleteOption(o.id)}
                      onArchive={(archived) => archiveOption(o.id, archived)}
                    />
                  )}
                </div>
              )
            })}

            {/* กองที่ซ่อนไว้ — จางกว่า กดเลือกไม่ได้ มีแต่ปุ่มเอากลับ (ผ่านเมนู ...) */}
            {canManageOptions && !loading && hidden.length > 0 && (
              <>
                <p className="px-1 pt-2 pb-1 text-xs text-warm-400 dark:text-disc-muted border-t border-warm-200 dark:border-disc-border mt-1">
                  {t('modal.optionHidden')} ({hidden.length})
                </p>
                {hidden.map((o) => {
                  const tint = chipProps(o)
                  return (
                    <div key={o.id}>
                      <div className="flex items-center gap-1.5 px-1 py-1 rounded-lg opacity-50">
                        <span style={tint.style} className={`flex-1 px-2.5 py-0.5 text-sm font-medium rounded-md line-through ${tint.className}`}>
                          {o.name}
                        </span>
                        {busyOpt === o.id && <Loader2 size={14} className="animate-spin text-warm-400 dark:text-disc-muted shrink-0" />}
                        <button
                          type="button"
                          onClick={() => archiveOption(o.id, false)}
                          className="px-2 py-0.5 text-xs rounded-md border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover shrink-0"
                        >
                          {t('modal.optionRestore')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteOption(o.id)}
                          aria-label={t('modal.optionDelete')}
                          title={t('modal.optionDelete')}
                          className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-red-500 shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {canManageOptions && !loading && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={createOption}
                disabled={creating}
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-left text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg disabled:opacity-50"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} className="opacity-0" />}
                {t('modal.tagCreateOption', { name: query.trim() })}
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
