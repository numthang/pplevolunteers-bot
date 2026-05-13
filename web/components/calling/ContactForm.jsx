'use client'

import { useState, useEffect } from 'react'
import geographyData from '@/lib/thailand-geography.json'
import { CATEGORIES } from '@/../config/callingCategories.js'

const PROVINCE_LIST = geographyData.map(p => p.province).sort((a, b) => a.localeCompare(b, 'th'))

export default function ContactForm({ initial = {}, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    first_name: initial.first_name || '',
    phone:      initial.phone      || '',
    line_id:    initial.line_id    || '',
    category:   initial.category   || '',
    specialty:  initial.specialty  || '',
    province:   initial.province   || '',
    amphoe:     initial.amphoe     || '',
    tambon:     initial.tambon     || '',
    note:       initial.note       || '',
  })

  const [amphoeList, setAmphoeList] = useState([])
  const [tambonList, setTambonList] = useState([])

  useEffect(() => {
    if (!form.province) { setAmphoeList([]); setTambonList([]); return }
    const prov = geographyData.find(p => p.province === form.province)
    setAmphoeList(prov ? prov.amphoes.slice().sort((a, b) => a.amphoe.localeCompare(b.amphoe, 'th')) : [])
    setTambonList([])
  }, [form.province])

  useEffect(() => {
    if (!form.amphoe || !amphoeList.length) { setTambonList([]); return }
    const amp = amphoeList.find(a => a.amphoe.replace(/^อำเภอ/, '') === form.amphoe)
    setTambonList(amp ? amp.tambons.slice().sort((a, b) => a.localeCompare(b, 'th')) : [])
  }, [form.amphoe, amphoeList])

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'province') { next.amphoe = ''; next.tambon = '' }
      if (field === 'amphoe')   { next.tambon = '' }
      return next
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit(form)
  }

  const inputCls = 'w-full h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal'
  const textareaCls = 'w-full px-3 py-2 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal'
  const labelCls = 'block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ชื่อ */}
      <div>
        <label className={labelCls}>ชื่อ <span className="text-red-500">*</span></label>
        <input className={inputCls} value={form.first_name}
          onChange={e => set('first_name', e.target.value)} required placeholder="ชื่อ" />
      </div>

      {/* ประเภท */}
      <div>
        <label className={labelCls}>ประเภท</label>
        <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
          <option value="">— เลือกประเภท —</option>
          {CATEGORIES.map(g => (
            <optgroup key={g.group} label={g.group}>
              {g.options.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* เบอร์โทร / LINE */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>เบอร์โทร</label>
          <input className={inputCls} value={form.phone}
            onChange={e => set('phone', e.target.value)} placeholder="0812345678" />
        </div>
        <div>
          <label className={labelCls}>LINE ID</label>
          <input className={inputCls} value={form.line_id}
            onChange={e => set('line_id', e.target.value)} placeholder="@lineId" />
        </div>
      </div>

      {/* อาชีพ / ตำแหน่ง / ความสามารถ */}
      <div>
        <label className={labelCls}>อาชีพ / ตำแหน่ง / ความสามารถ</label>
        <textarea className={textareaCls} rows={2} value={form.specialty}
          onChange={e => set('specialty', e.target.value)}
          placeholder="เช่น ครู / นักธุรกิจ / ออกแบบกราฟิก / พูดอังกฤษได้" />
      </div>

      {/* Cascading dropdown: จังหวัด → อำเภอ → ตำบล */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>จังหวัด</label>
          <select className={inputCls} value={form.province} onChange={e => set('province', e.target.value)}>
            <option value="">— จังหวัด —</option>
            {PROVINCE_LIST.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>อำเภอ</label>
          <select className={inputCls} value={form.amphoe} onChange={e => set('amphoe', e.target.value)}
            disabled={!amphoeList.length}>
            <option value="">— อำเภอ —</option>
            {amphoeList.map(a => { const n = a.amphoe.replace(/^อำเภอ/, ''); return <option key={n} value={n}>{n}</option> })}
          </select>
        </div>
        <div>
          <label className={labelCls}>ตำบล</label>
          <select className={inputCls} value={form.tambon} onChange={e => set('tambon', e.target.value)}
            disabled={!tambonList.length}>
            <option value="">— ตำบล —</option>
            {tambonList.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* หมายเหตุ */}
      <div>
        <label className={labelCls}>หมายเหตุ</label>
        <textarea className={textareaCls} rows={3} value={form.note}
          onChange={e => set('note', e.target.value)}
          placeholder="ข้อมูลเพิ่มเติม เช่น รู้จักกันผ่านอะไร ความสัมพันธ์กับพรรค" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-3 text-base font-medium rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover">
            ยกเลิก
          </button>
        )}
        <button type="submit" disabled={loading}
          className="px-4 py-3 text-base font-medium rounded-lg bg-teal hover:opacity-90 text-white disabled:opacity-40">
          {loading ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}
