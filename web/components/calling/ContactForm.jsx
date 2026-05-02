'use client'

import { useState, useEffect } from 'react'
import geographyData from '@/lib/thailand-geography.json'

const CATEGORIES = [
  { value: 'donor',     label: 'ผู้บริจาค' },
  { value: 'prospect',  label: 'คนสนใจ' },
  { value: 'volunteer', label: 'อาสาสมัคร' },
  { value: 'other',     label: 'อื่นๆ' },
]

const PROVINCE_LIST = geographyData.map(p => p.province)

export default function ContactForm({ initial = {}, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    first_name: initial.first_name || '',
    last_name:  initial.last_name  || '',
    phone:      initial.phone      || '',
    email:      initial.email      || '',
    line_id:    initial.line_id    || '',
    category:   initial.category   || '',
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
    setAmphoeList(prov ? prov.amphoes : [])
    setTambonList([])
  }, [form.province])

  useEffect(() => {
    if (!form.amphoe || !amphoeList.length) { setTambonList([]); return }
    const amp = amphoeList.find(a => a.amphoe === form.amphoe)
    setTambonList(amp ? amp.tambons : [])
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

  const inputCls = 'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-400'
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* ชื่อ-นามสกุล */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>ชื่อ <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.first_name}
            onChange={e => set('first_name', e.target.value)} required placeholder="ชื่อ" />
        </div>
        <div>
          <label className={labelCls}>นามสกุล <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.last_name}
            onChange={e => set('last_name', e.target.value)} required placeholder="นามสกุล" />
        </div>
      </div>

      {/* ประเภท */}
      <div>
        <label className={labelCls}>ประเภท</label>
        <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
          <option value="">— เลือกประเภท —</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* เบอร์โทร / Email / LINE */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>เบอร์โทร</label>
          <input className={inputCls} value={form.phone}
            onChange={e => set('phone', e.target.value)} placeholder="0812345678" />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input className={inputCls} type="email" value={form.email}
            onChange={e => set('email', e.target.value)} placeholder="example@mail.com" />
        </div>
        <div>
          <label className={labelCls}>LINE ID</label>
          <input className={inputCls} value={form.line_id}
            onChange={e => set('line_id', e.target.value)} placeholder="@lineId" />
        </div>
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
            {amphoeList.map(a => <option key={a.amphoe} value={a.amphoe}>{a.amphoe}</option>)}
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
        <textarea className={inputCls} rows={3} value={form.note}
          onChange={e => set('note', e.target.value)}
          placeholder="ข้อมูลเพิ่มเติม เช่น รู้จักกันผ่านอะไร ความสัมพันธ์กับพรรค" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
            ยกเลิก
          </button>
        )}
        <button type="submit" disabled={loading}
          className="px-4 py-2 text-sm rounded-lg bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50">
          {loading ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </form>
  )
}
