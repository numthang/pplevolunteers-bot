'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const AUTOSAVE_MS = 800

/**
 * autosave ของหน้าเคส — ใช้ร่วมกัน 3 การ์ด (เนื้อหา · ข้อมูลเคส · ผู้ร้องเรียน)
 *
 * กฎ CLAUDE.md §กฎการบันทึก: หน้า Update ที่มี autosave **ห้ามมีปุ่มบันทึก**
 * → สิ่งที่ต้องมีแทนคือ ป้ายสถานะ (saveState) + beforeunload ตอนของยังไม่ถึง DB — ทำไว้ครบตรงนี้
 *
 * @param manualKeys ช่องที่ **ห้ามเซฟตอนพิมพ์** ต้องเรียก flush([key]) เอง (blur/Enter)
 *   ตอนนี้มีตัวเดียวคือ `title`: PATCH ที่แตะ title จะโพสต์แจ้งลงเธรด Discord ทุกครั้ง
 *   (app/api/case/[ref]/route.js) → ปล่อยให้ debounce ยิงทุก 800ms = เธรดโดนสแปมตอนพิมพ์
 * @param validate (payload) => ข้อความ error | '' — ตรวจ **ก่อนยิง** เพื่อไม่ต้องแลก 400 กับ
 *   ช่องบังคับที่ว่างอยู่ชั่วคราวระหว่างพิมพ์ (server ตีกลับ title/detail/name ว่าง)
 */
export default function useCaseAutosave({ refId, canEdit, initial, manualKeys = [], validate }) {
  const keys = useMemo(() => Object.keys(initial), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [values, setValues] = useState(() => ({ ...initial }))
  const [saveState, setSaveState] = useState('idle')   // idle | saving | saved
  const [pendingSave, setPendingSave] = useState(false)
  const [error, setError] = useState('')

  const baseline = useRef({ ...initial })   // ค่าที่ server รับไปแล้วจริงๆ (ไม่ใช่ค่าที่เพิ่งยิง)
  const valuesRef = useRef(values)
  valuesRef.current = values
  const timer = useRef(null)
  // ยิงทีละคำขอเรียงคิว — blur ของหัวข้อกับ debounce ของรายละเอียดชนกันได้จริง
  // payload คิดตอน "ถึงคิว" ไม่ใช่ตอนสั่ง จึงไม่มีทางส่งค่าเก่าทับค่าใหม่
  const chain = useRef(Promise.resolve())

  const norm = (v) => (v ?? '')
  const set = useCallback((key, value) => setValues(v => ({ ...v, [key]: value })), [])

  const flush = useCallback((only) => {
    clearTimeout(timer.current)
    const run = async () => {
      if (!canEdit) return
      const target = only || keys
      const v = valuesRef.current
      const payload = {}
      for (const k of target) {
        if (norm(v[k]) !== norm(baseline.current[k])) payload[k] = norm(v[k])
      }
      if (!Object.keys(payload).length) { setPendingSave(false); return }

      const invalid = validate?.(payload)
      if (invalid) { setError(invalid); setPendingSave(false); setSaveState('idle'); return }

      setPendingSave(false)
      setError('')
      setSaveState('saving')
      try {
        const res = await fetch(`/api/case/${refId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok || d.error) {
          setSaveState('idle')
          setError(d.error || 'บันทึกไม่สำเร็จ')
          return
        }
        // ค่าที่ server แปลงเอง (เช่นเบอร์โทรที่ผ่าน normalizePhone) ต้องกลับมาลงกล่อง
        // ไม่งั้นหน้าจอโชว์คนละค่ากับที่อยู่ใน DB จนกว่าจะรีโหลด
        const fields = d.fields || {}
        baseline.current = { ...baseline.current, ...payload, ...fields }
        if (Object.keys(fields).length) setValues(cur => ({ ...cur, ...fields }))
        setSaveState('saved')
        setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
      } catch {
        setSaveState('idle')
        setError('บันทึกไม่สำเร็จ (เน็ตมีปัญหา?)')
      }
    }
    chain.current = chain.current.then(run, run)
    return chain.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refId, canEdit, keys, validate])

  // autosave — เฉพาะช่องที่ไม่ได้อยู่ใน manualKeys
  useEffect(() => {
    if (!canEdit) return
    const autoKeys = keys.filter(k => !manualKeys.includes(k))
    const dirty = autoKeys.some(k => norm(values[k]) !== norm(baseline.current[k]))
    if (!dirty) { setPendingSave(false); return }
    clearTimeout(timer.current)
    setPendingSave(true)
    timer.current = setTimeout(() => flush(autoKeys), AUTOSAVE_MS)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, canEdit])

  const isDirty = useCallback((key) => norm(valuesRef.current[key]) !== norm(baseline.current[key]), [])
  const dirtyAny = keys.some(k => norm(values[k]) !== norm(baseline.current[k]))

  // ไม่มีปุ่มบันทึก → ด่านเดียวที่กันงานหายคือตรงนี้
  // dirtyAny ต้องอยู่ในเงื่อนไขด้วย: เซฟล้มเหลว/ช่องที่รอ blur จะไม่มีทั้ง pendingSave และ saving
  useEffect(() => {
    if (!dirtyAny && !pendingSave && saveState !== 'saving') return
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyAny, pendingSave, saveState])

  return { values, set, setValues, baseline, saveState, error, setError, flush, isDirty, dirtyAny }
}
