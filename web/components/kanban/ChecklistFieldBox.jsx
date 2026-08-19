'use client'

/**
 * ChecklistFieldBox — เช็คลิสต์ 1 field (ตรงสกรีนช็อตที่ user ส่งมา 2026-08-18 รอบเย็น: progress bar + %
 * + ลากจัดลำดับ + ปุ่มซ่อนงานที่เสร็จแล้ว) — การ์ดใบเดียวมีได้หลาย field ชนิดนี้ ผูกด้วย (cardId, fieldId)
 *
 * ⭐ ช่อง "เพิ่มรายการ" ดึงจาก **คลังตัวเลือกเดียวกับ multi_select** (`kanban_field_options`)
 *   เคสจริง: `อุปกรณ์` — ไม่ต้องพิมพ์ "เต็นท์ โต๊ะ เก้าอี้ ลำโพง" ใหม่ทุกการ์ด หยิบจากคลังได้เลย
 *   พิมพ์ชื่อใหม่ = server สร้างตัวเลือกลงคลังให้เอง (`ensureFieldOption`) เหมือน multi_select เป๊ะ
 *
 * ⛔ **ห้ามเอา TagCombobox มาใช้ตรงนี้** (ตรวจแล้ว 2026-08-18 — เก็บค่าคนละแบบ):
 *   TagCombobox ถือ "Set ของ option id" แล้วเขียน value_options ทีเดียวทั้งก้อน
 *   เช็คลิสต์เป็น "แถวจริง" ที่แต่ละแถวมี id/done/sort_order ของตัวเอง เขียนทีละแถว
 *   Set แทน done กับลำดับรายตัวไม่ได้ → ยัดเข้าไปคือต้องรื้อ TagCombobox ให้รับ 2 value model
 *   ที่ reuse จริงคือ **endpoint ฝั่ง server** ไม่ใช่ตัว component
 */

import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, GripVertical, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react'
import { DropLine } from './FieldRow.jsx'
// ⛔ **ไม่มีเมนู ... ในเช็คลิสต์** — user สั่ง 2026-08-19 ค่ำ: "ไม่ต้องมีไข่ปลาให้กดเปลี่ยนสี หรือ delete tag
//    เอาออกไปเลย ไม่ได้ใช้" · ชิปคลังเหลือหน้าที่เดียวคือกดหยิบเข้าการ์ด
//    การจัดการตัวเลือกทั้งหมดไปอยู่ที่ **ถังขยะท้ายงานย่อย** ซึ่งเปิดกล่องเดียวกับ "ลบการบ้าน"
import * as optionAPI from '@/lib/kanbanOptionActions.js'
import DeleteChoiceDialog from './DeleteChoiceDialog.jsx'

/**
 * แท่งความคืบหน้าของเช็คลิสต์ — ใช้ทั้งในกล่องนี้ (คู่กับ %) และบนการ์ดในกระดาน
 * (user สั่ง 2026-08-19: บนการ์ดเอาแท่งแทนตัวเลข x/y) — ห้ามลอก markup ไปเขียนซ้ำ
 */
export function ChecklistBar({ done, total, className = '' }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className={`h-1.5 rounded-full bg-warm-100 dark:bg-disc-hover overflow-hidden ${className}`}>
      <div className="h-full bg-teal transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * ช่องแก้ข้อความงานย่อย — ทรงเดียวกับ FieldNameInput ใน CardFieldsBox
 * ⚠️ blur = บันทึกแล้วปิด · ต้องรอผลจริงแล้วเด้งกลับถ้าไม่ผ่าน ไม่งั้นโชว์ชื่อที่ DB ไม่เคยรับ
 */
function ItemTextInput({ item, t, onRename, onClose }) {
  const [text, setText] = useState(item.text)
  useEffect(() => { setText(item.text) }, [item.text])

  const commit = async () => {
    const clean = text.trim()
    if (!clean || clean === item.text) { setText(item.text); return }
    const ok = await onRename(clean)
    if (!ok) setText(item.text)
  }

  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={async () => { await commit(); onClose() }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setText(item.text); e.currentTarget.blur() }
      }}
      maxLength={60}
      aria-label={t('modal.renameItem')}
      className="flex-1 min-w-0 h-8 px-2 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
    />
  )
}

export default function ChecklistFieldBox({ cardId, fieldId, items = [], readOnly, onItemsChanged, onError, t }) {
  const [newText, setNewText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addOpen, setAddOpen] = useState(false)   // ช่องเพิ่มรายการกางอยู่ไหม (ปกติซ่อน เหลือแค่ปุ่ม)
  const [pool, setPool] = useState([])            // คลังตัวเลือกของ field นี้ (โหลดครั้งเดียวตอน mount)
  const [busyId, setBusyId] = useState(null)
  const [editingId, setEditingId] = useState(null)  // งานย่อยที่กำลังแก้ข้อความอยู่
  const [hideDone, setHideDone] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [dropAt, setDropAt] = useState(null)   // { id, above } — เส้นบอกจุดวาง ขึ้นทีละเส้นเดียว
  const [busyOpt, setBusyOpt] = useState(null)   // ตัวเลือกในคลังที่กำลังยิงคำสั่งอยู่
  const [confirmItem, setConfirmItem] = useState(null) // งานย่อยที่กดถังขยะ (รอเลือกซ่อน/ลบถาวร)
  const [confirmUsed, setConfirmUsed] = useState(null) // จำนวนการ์ดที่ใช้ตัวเลือกนี้อยู่

  const total = items.length
  const done = items.filter((i) => i.done).length
  const pct = total ? Math.round((done / total) * 100) : 0
  const shown = hideDone ? items.filter((i) => !i.done) : items

  // โหลดคลังไว้ทำรายการแนะนำ — ล้มก็ไม่เป็นไร ช่องยังพิมพ์เองได้ตามปกติ
  const loadPool = useCallback(async () => {
    try {
      // archived=1 — ต้องเห็นตัวที่ซ่อนไว้ถึงจะกด "เอากลับ" ได้ · กรองออกจากรายการแนะนำที่ฝั่งนี้แทน
      const list = await optionAPI.fetchOptions(fieldId, { archived: true })
      if (list) setPool(list)
    } catch { /* เงียบได้ — เป็นแค่ตัวช่วย ไม่ใช่ทางเดียวที่เพิ่มรายการได้ */ }
  }, [fieldId])

  useEffect(() => { if (!readOnly) loadPool() }, [readOnly, loadPool])

  // ตัวที่ยังไม่ได้อยู่บนการ์ดใบนี้ + ตรงกับที่พิมพ์ (ของที่มีอยู่แล้วไม่ต้องเสนอซ้ำ)
  const used = new Set(items.map((i) => String(i.option_id)).filter((v) => v !== 'null'))
  const q = newText.trim().toLowerCase()
  const suggestions = pool
    .filter((o) => !o.archived_at)        // ซ่อนแล้ว = ไม่เสนอให้เพิ่มใหม่ (แต่ยังอยู่ในกอง "ซ่อนไว้" ข้างล่าง)
    .filter((o) => !used.has(String(o.id)))
    .filter((o) => !q || o.name.toLowerCase().includes(q))
    .slice(0, 8)
  const hiddenPool = pool.filter((o) => o.archived_at)

  async function call(method, body, query = '') {
    const res = await fetch(`/api/kanban/cards/${cardId}/checklist${query}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { onError?.(json.error || t('saveFailed')); return null }
    return json
  }

  /** พิมพ์ชื่อเอง — server จะ ensureFieldOption ให้ ชื่อใหม่จึงเข้าคลังอัตโนมัติ */
  async function addItem(e) {
    e.preventDefault()
    const text = newText.trim()
    if (!text || adding) return
    setAdding(true)
    const json = await call('POST', { fieldId, text })
    if (json?.item) { onItemsChanged([...items, json.item]); setNewText(''); loadPool() }
    setAdding(false)
  }

  /**
   * กด "ซ่อน" ในกล่อง — **ซ่อนจากคลัง + เอาออกจากการ์ดใบนี้ พร้อมกัน** (user เคาะ 2026-08-19 ค่ำ)
   *
   * ทำไมต้องทำ 2 อย่าง: archive อย่างเดียวแปลว่า "การ์ดที่ติดไว้แล้วยังเห็น" → กดถังขยะแล้วไม่มีอะไรเกิดขึ้นบนจอ
   * ส่วนลบแถวอย่างเดียวก็ยังถูกเสนอให้หยิบกลับมาใหม่เรื่อยๆ · user ต้องการทั้งคู่
   * การ์ด **ใบอื่น** ที่ใช้อยู่ยังเห็นเหมือนเดิม — นั่นคือเส้นแบ่งกับ "ลบถาวร"
   */
  async function hideItem(item) {
    setBusyId(item.id)
    if (item.option_id) {
      const res = await optionAPI.setOptionArchived(fieldId, item.option_id, true)
      if (!res.ok) { onError?.(res.error || t('saveFailed')); setBusyId(null); return }
      setPool((prev) => prev.map((o) => (String(o.id) === String(item.option_id) ? res.option : o)))
    }
    const json = await call('DELETE', null, `?itemId=${item.id}`)
    if (json) onItemsChanged(items.filter((i) => i.id !== item.id))
    setBusyId(null)
    setConfirmItem(null)
  }

  /** กด "ลบถาวร" ในกล่อง — ลบตัวเลือกออกจากคลัง แถวงานย่อยหายจาก**ทุกการ์ด** กู้ไม่ได้ */
  async function purgeItem(item) {
    setBusyId(item.id)
    // แถวที่ไม่ได้ผูกคลัง (ของเก่า) ไม่มีตัวเลือกให้ลบ — ลบแค่แถวก็จบ
    if (item.option_id) {
      const res = await optionAPI.deleteOption(fieldId, item.option_id)
      if (!res.ok) { onError?.(res.error || t('saveFailed')); setBusyId(null); return }
      setPool((prev) => prev.filter((o) => String(o.id) !== String(item.option_id)))
      onItemsChanged(items.filter((i) => String(i.option_id) !== String(item.option_id)))
    } else {
      const json = await call('DELETE', null, `?itemId=${item.id}`)
      if (json) onItemsChanged(items.filter((i) => i.id !== item.id))
    }
    setBusyId(null)
    setConfirmItem(null)
  }

  /** เอากลับจากกอง "ซ่อนไว้" — คืนตัวเลือกเข้ารายการแนะนำ (ยังไม่ผูกกับการ์ดใบนี้ ต้องกดหยิบเอง) */
  async function restoreOption(optId) {
    setBusyOpt(optId)
    const res = await optionAPI.setOptionArchived(fieldId, optId, false)
    setBusyOpt(null)
    if (!res.ok) { onError?.(res.error || t('saveFailed')); return }
    setPool((prev) => prev.map((o) => (String(o.id) === String(optId) ? res.option : o)))
  }

  /** หยิบจากคลัง — ไม่ต้องพิมพ์ */
  async function addFromPool(option) {
    if (adding) return
    setAdding(true)
    const json = await call('POST', { fieldId, optionId: option.id })
    if (json?.item) { onItemsChanged([...items, json.item]); setNewText('') }
    setAdding(false)
  }

  async function toggleDone(item) {
    // ⚠️ ไม่ optimistic — onItemsChanged เรียก onChanged() ของหน้ารายการด้วย ยิง 2 ครั้ง (ก่อน/หลัง await)
    //    แข่งกันเองแล้วรายการ (badge x/y) ค้างค่าเก่าได้ถ้า response สลับลำดับ (เจอจาก browser test)
    //    รอบเดียวหลัง await พอ — การ์ดเช็คลิสต์ 1 ทีไม่มีดีเลย์ที่คนสังเกตออก (แนวเดียวกับโค้ดเดิมก่อนกลับคำ)
    setBusyId(item.id)
    const json = await call('PATCH', { itemId: item.id, done: !item.done })
    if (json?.item) onItemsChanged(items.map((i) => (i.id === item.id ? json.item : i)))
    setBusyId(null)
  }

  /**
   * แก้ข้อความงานย่อย — **เฉพาะการ์ดใบนี้** (user เคาะ 2026-08-19)
   * ชื่อใหม่เข้าคลังให้เหมือนตอนพิมพ์เพิ่ม · ชื่อเก่ายังอยู่ในคลัง การ์ดใบอื่นที่ใช้อยู่ไม่เปลี่ยนตาม
   * @returns {Promise<boolean>} สำเร็จไหม — ช่องเด้งค่าเดิมกลับเองถ้า false (ห้ามให้ UI โชว์ชื่อที่ DB ไม่รับ)
   */
  async function renameItem(item, text) {
    setBusyId(item.id)
    const json = await call('PATCH', { itemId: item.id, fieldId, text })
    if (json?.item) { onItemsChanged(items.map((i) => (i.id === item.id ? json.item : i))); loadPool() }
    setBusyId(null)
    return Boolean(json?.item)
  }

  // ⛔ ถังขยะไม่ลบทันทีอีกต่อไป — เปิด DeleteChoiceDialog ให้เลือก ซ่อน / ลบถาวร (user สั่ง 2026-08-19 ค่ำ)
  //    ตัวลบจริงอยู่ที่ hideItem() กับ purgeItem()

  // นับว่าตัวเลือกนี้ถูกใช้อยู่กี่การ์ด ตอนเปิดกล่อง — นับไม่ได้ก็ยังถามต่อ แค่ไม่มีตัวเลขให้ดู
  useEffect(() => {
    if (!confirmItem?.option_id) { setConfirmUsed(null); return }
    let alive = true
    optionAPI.fetchOptionImpact(fieldId, confirmItem.option_id).then((n) => { if (alive) setConfirmUsed(n) })
    return () => { alive = false }
  }, [confirmItem, fieldId])

  /**
   * วางงานย่อยที่ลากมา — index ต้องตรงกับ **เส้นที่วาดไว้** เป๊ะ ไม่งั้นวางแล้วเด้งไปคนละที่
   * ⭐ ลอกสูตรจาก onDropField ใน CardFieldsBox ตัวเดียวกัน (ครึ่งล่าง = แทรกหลัง → +1
   *    แล้วชดเชย -1 เพราะถอดตัวเองออกจาก array ไปก่อนแล้ว)
   */
  async function onDropReorder(targetId) {
    const at = dropAt
    setDropAt(null)
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const list = [...items]
    const from = list.findIndex((i) => i.id === dragId)
    let to = list.findIndex((i) => i.id === targetId)
    setDragId(null)
    if (from === -1 || to === -1) return
    if (at && at.id === targetId && !at.above) to += 1
    const [moved] = list.splice(from, 1)
    if (from < to) to -= 1
    list.splice(to, 0, moved)
    onItemsChanged(list)
    await call('PATCH', { fieldId, reorder: list.map((i) => i.id) })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {/* ⚠️ ไม่วาดชื่อ field ที่นี่ — ชื่ออยู่ที่หัวแถวใน CardFieldsBox ซึ่งคลิกเข้าโหมดแก้ได้ */}
        <ListChecks size={16} className="text-warm-500 dark:text-disc-muted shrink-0" />
        {total > 0 && (
          <>
            <ChecklistBar done={done} total={total} className="flex-1" />
            <span className="text-xs text-warm-400 dark:text-disc-muted shrink-0">{pct}%</span>
            <button
              type="button"
              onClick={() => setHideDone((v) => !v)}
              title={hideDone ? t('modal.checklistShowDone') : t('modal.checklistHideDone')}
              className="p-1 text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text shrink-0"
            >
              {hideDone ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {shown.map((item) => (
          <div key={item.id}>
            {/* เส้นบอกจุดวาง — เส้นเดียวตรงที่เมาส์ลอยอยู่จริง (ทรงเดียวกับตอนลาก field) */}
            {dropAt?.id === item.id && dropAt.above && <DropLine />}
            <div
              className={`flex items-center gap-2 group ${dragId === item.id ? 'opacity-40' : ''}`}
              draggable={!readOnly}
              onDragStart={() => setDragId(item.id)}
              onDragEnd={() => { setDragId(null); setDropAt(null) }}
              onDragOver={(e) => {
                if (!dragId || dragId === item.id) return
                e.preventDefault()
                // ครึ่งบน = แทรกก่อนแถวนี้ · ครึ่งล่าง = แทรกหลัง — เส้นจะได้ตรงกับที่วางจริง
                const r = e.currentTarget.getBoundingClientRect()
                setDropAt({ id: item.id, above: e.clientY < r.top + r.height / 2 })
              }}
              onDragLeave={(e) => {
                // ออกจากแถวจริงๆ เท่านั้น ไม่ใช่แค่ย้ายเข้า element ลูก
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setDropAt((d) => (d && d.id === item.id ? null : d))
                }
              }}
              onDrop={() => onDropReorder(item.id)}
            >
            {!readOnly && <GripVertical size={14} className="text-warm-300 dark:text-disc-muted cursor-grab shrink-0" />}
            <input
              type="checkbox"
              checked={item.done}
              disabled={readOnly}
              onChange={() => toggleDone(item)}
              className="w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer shrink-0"
            />
            {/* คลิกที่ข้อความ = แก้ตรงนั้น (user ทัก 2026-08-19: เดิมแก้ไม่ได้เลย มีแค่ติ๊ก/ลาก/ลบ)
                ทรงเดียวกับชื่อ field: Enter/คลิกออก = บันทึกแล้วปิด · ESC = ทิ้ง */}
            {editingId === item.id ? (
              <ItemTextInput
                item={item}
                t={t}
                onRename={(text) => renameItem(item, text)}
                onClose={() => setEditingId((cur) => (cur === item.id ? null : cur))}
              />
            ) : readOnly ? (
              <span className={`flex-1 text-base ${item.done ? 'line-through text-warm-400 dark:text-disc-muted' : 'text-warm-900 dark:text-disc-text'}`}>
                {item.text}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setEditingId(item.id)}
                title={t('modal.renameItem')}
                className={`flex-1 min-w-0 text-left text-base ${item.done ? 'line-through text-warm-400 dark:text-disc-muted' : 'text-warm-900 dark:text-disc-text'}`}
              >
                {item.text}
              </button>
            )}
            {busyId === item.id && <Loader2 size={14} className="animate-spin text-warm-400 dark:text-disc-muted shrink-0" />}
            {!readOnly && (
              <button
                onClick={() => setConfirmItem(item)}
                aria-label={t('modal.removeItem')}
                title={t('modal.removeItem')}
                className="p-1 rounded text-warm-400 dark:text-disc-muted opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            )}
            </div>
            {dropAt?.id === item.id && !dropAt.above && <DropLine />}
          </div>
        ))}
      </div>

      {/* รายการแนะนำจากคลัง — กดหยิบได้เลยไม่ต้องพิมพ์ (หัวใจของก้อนนี้)
          โชว์เฉพาะตัวที่การ์ดใบนี้ยังไม่มี · กรองตามที่พิมพ์ · ไม่มีคลัง = ไม่โผล่อะไรเลย ช่องพิมพ์ทำงานปกติ */}
      {/*
        ⭐ ปกติซ่อนช่องพิมพ์ไว้ โชว์แค่ปุ่ม "เพิ่มรายการ" (user สั่ง 2026-08-19)
        กดแล้วค่อยกางช่อง + รายการแนะนำจากคลัง — เช็คลิสต์ยาวๆ จะได้ไม่มีช่องว่างค้างท้ายทุกอัน
      */}
      {!readOnly && !addOpen && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="mt-1.5 flex items-center gap-1 text-sm text-warm-400 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text"
        >
          <Plus size={14} />
          {t('modal.addItemPlaceholder')}
        </button>
      )}

      {!readOnly && addOpen && (
        <>
          {suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  /* ⚠️ ห้ามตัดออก — ช่องพิมพ์ข้างล่าง onBlur ปิดตัวเองเมื่อยังไม่ได้พิมพ์อะไร
                     กดชิปตอนช่องว่าง = mousedown → blur → ชิปหายไปก่อน click จะทำงาน = กดไม่ติด
                     (user เจอจริง 2026-08-19: "กดแล้วก็ไม่กลับเข้ามา") */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addFromPool(o)}
                  disabled={adding || busyOpt === o.id}
                  className="flex items-center gap-1 px-2 py-1 text-xs whitespace-nowrap rounded-md border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50 transition"
                >
                  <Plus size={12} className="shrink-0" />
                  {o.name}
                </button>
              ))}
            </div>
          )}

          {/* กองที่ซ่อนไว้ — ไม่เสนอให้เพิ่ม แต่เอากลับได้ตลอด */}
          {hiddenPool.length > 0 && (
            <div className="mt-2 pt-2 border-t border-warm-200 dark:border-disc-border">
              <p className="text-xs text-warm-400 dark:text-disc-muted mb-1">
                {t('modal.optionHidden')} ({hiddenPool.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {hiddenPool.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-1 pl-2 pr-1 py-1 text-xs rounded-md border border-warm-200 dark:border-disc-border text-warm-400 dark:text-disc-muted opacity-70"
                  >
                    <span className="line-through whitespace-nowrap">{o.name}</span>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => restoreOption(o.id)}
                      disabled={busyOpt === o.id}
                      className="px-1.5 rounded hover:text-warm-900 dark:hover:text-disc-text disabled:opacity-50"
                    >
                      {busyOpt === o.id ? <Loader2 size={12} className="animate-spin" /> : t('modal.optionRestore')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={addItem} className="mt-1.5 flex gap-2">
            <input
              autoFocus
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              // ปิดเมื่อกด ESC หรือคลิกออกโดยยังไม่พิมพ์อะไร — ไม่งั้นช่องค้างเปิดตลอด
              onKeyDown={(e) => { if (e.key === 'Escape') { setNewText(''); setAddOpen(false) } }}
              onBlur={() => { if (!newText.trim()) setAddOpen(false) }}
              placeholder={t('modal.addItemPlaceholder')}
              maxLength={60}
              className="flex-1 h-9 px-3 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
            />
            <button
              type="submit"
              disabled={adding || !newText.trim()}
              aria-label={t('modal.addItem')}
              title={t('modal.addItem')}
              className="flex items-center gap-1 px-3 rounded-lg bg-teal text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </form>
        </>
      )}

      {/* ถังขยะท้ายงานย่อย → กล่องเดียวกับ "ลบการบ้าน" · ซ่อน = ออกจากการ์ดใบนี้ + ซ่อนจากคลัง */}
      {confirmItem && (
        <DeleteChoiceDialog
          t={t}
          heading={t('modal.itemDeleteHeading')}
          title={confirmItem.text}
          impact={confirmUsed ? t('modal.optionPurgeImpact', { count: confirmUsed }) : null}
          hideHint={t('modal.optionHideHint')}
          hideLabel={t('actions.hide')}
          canPurge
          busy={busyId === confirmItem.id}
          onClose={() => setConfirmItem(null)}
          onHide={() => hideItem(confirmItem)}
          onPurge={() => purgeItem(confirmItem)}
        />
      )}
    </div>
  )
}
