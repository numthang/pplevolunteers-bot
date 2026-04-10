'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import CategorySelect, { CatIcon } from '@/components/CategorySelect'
import AccountSelect from '@/components/AccountSelect'
import { Pencil, Trash2, ImagePlus, X, ChevronDown } from 'lucide-react'
import BankBadge from '@/components/BankBadge'

function TransactionsContent() {
  const searchParams = useSearchParams()
  const defaultAccountId = searchParams.get('accountId') || ''

  const [txns, setTxns]         = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter]     = useState({ accountId: defaultAccountId, type: '', categoryId: '', search: '' })
  const [searchInput, setSearchInput] = useState('')
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [hasMore, setHasMore]   = useState(true)
  const [loading, setLoading]   = useState(false)
  const sentinelRef             = useRef(null)
  const loadingRef              = useRef(false)
  const offsetRef               = useRef(0)
  const LIMIT = 50

  function toLocalDT(d = new Date()) {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const EMPTY_FORM = { account_id: defaultAccountId, type: 'income', amount: '', description: '', category_id: '', source: '', txn_at: toLocalDT() }

  useEffect(() => {
    fetch('/api/finance/accounts').then(r => r.json()).then(setAccounts)
    fetch('/api/finance/categories').then(r => r.json()).then(setCategories)
  }, [])

  const fetchPage = useCallback(async (currentOffset, reset = false) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    const p = new URLSearchParams()
    if (filter.accountId)  p.set('accountId',  filter.accountId)
    if (filter.type)       p.set('type',        filter.type)
    if (filter.categoryId) p.set('categoryId',  filter.categoryId)
    if (filter.search)     p.set('search',      filter.search)
    p.set('limit',  LIMIT)
    p.set('offset', currentOffset)
    const rows = await fetch('/api/finance/transactions?' + p).then(r => r.json())
    setTxns(prev => {
      const merged = reset ? rows : [...prev, ...rows]
      const seen = new Set()
      return merged.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
    })
    setHasMore(rows.length === LIMIT)
    setLoading(false)
    loadingRef.current = false
  }, [filter])

  // reset on filter change
  useEffect(() => {
    offsetRef.current = 0
    loadingRef.current = false
    setTxns([])
    setHasMore(true)
    fetchPage(0, true)
  }, [filter])

  // infinite scroll
  useEffect(() => {
    if (!sentinelRef.current) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
        const next = offsetRef.current + LIMIT
        offsetRef.current = next
        fetchPage(next)
      }
    }, { threshold: 0.1 })
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, fetchPage])

  const load = useCallback(() => {
    offsetRef.current = 0
    loadingRef.current = false
    setTxns([])
    setHasMore(true)
    fetchPage(0, true)
  }, [fetchPage])

  function openNew()  { setForm({ ...EMPTY_FORM }); setEditing({}) }
  function openEdit(t){ setForm({ ...t, txn_at: toLocalDT(new Date(t.txn_at)) }); setEditing(t) }
  function close()    { setEditing(null) }

  async function save() {
    if (!form.account_id) return alert('กรุณาเลือกบัญชี')
    if (!form.amount || Number(form.amount) <= 0) return alert('กรุณาใส่จำนวนเงิน')
    const isNew = !editing?.id
    await fetch(isNew ? '/api/finance/transactions' : `/api/finance/transactions/${editing.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    close(); load()
  }

  async function remove(id) {
    if (!confirm('ลบรายการนี้?')) return
    await fetch(`/api/finance/transactions/${id}`, { method: 'DELETE' })
    load()
  }

  async function changeCategory(t, categoryId) {
    await fetch(`/api/finance/transactions/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...t, category_id: categoryId || null }),
    })
    setTxns(prev => prev.map(x => x.id === t.id
      ? { ...x, category_id: categoryId, category_name: categories.find(c => c.id === Number(categoryId))?.name || null, category_icon: categories.find(c => c.id === Number(categoryId))?.icon || null }
      : x
    ))
    setExpandedId(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">รายการธุรกรรม</h1>
        <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + เพิ่มรายการ
        </button>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          className="w-full border dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
          placeholder="ค้นหารายการ..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setFilter(f => ({ ...f, search: searchInput }))}
          onBlur={() => setFilter(f => ({ ...f, search: searchInput }))}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        <AccountSelect
          accounts={accounts}
          value={filter.accountId}
          onChange={v => setFilter(f => ({ ...f, accountId: v }))}
          placeholder="ทุกบัญชี"
          className="min-w-48"
        />
        <div className="flex rounded border dark:border-gray-600 overflow-hidden text-sm">
          {[['', 'ทั้งหมด'], ['income', '📥 รายรับ'], ['expense', '📤 รายจ่าย']].map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => setFilter(f => ({ ...f, type: val }))}
              className={`px-3 py-1 ${filter.type === val ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >{label}</button>
          ))}
        </div>
        <CategorySelect
          categories={categories}
          value={filter.categoryId}
          onChange={v => setFilter(f => ({ ...f, categoryId: v }))}
          placeholder="ทุกหมวด"
          className="min-w-36"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {txns.length === 0 && (
          <div className="text-center py-12 text-gray-400">ไม่มีรายการ</div>
        )}
        {txns.reduce((acc, t) => {
          const dateKey = new Date(t.txn_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
          if (!acc.length || acc[acc.length - 1].dateKey !== dateKey) {
            acc.push({ dateKey, items: [] })
          }
          acc[acc.length - 1].items.push(t)
          return acc
        }, []).map(({ dateKey, items }) => (
          <div key={dateKey}>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 px-1 py-1.5 sticky top-0 bg-gray-50 dark:bg-gray-950 z-10">{dateKey}</p>
            <div className="space-y-1.5">
        {items.map(t => (
          <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
            {/* Main row */}
            <div
              className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 select-none"
              onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
            >
              <BankBadge bank={t.account_bank} size={32} />
              {t.evidence_url && (
                <img src={t.evidence_url} alt="" onClick={e => { e.stopPropagation(); window.open(t.evidence_url, '_blank') }}
                  className="w-10 h-10 rounded object-cover flex-shrink-0 border dark:border-gray-600 cursor-zoom-in" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">{t.description || '—'}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                  {t.account_name}
                  {t.category_name && (
                    <>
                      <span>·</span>
                      <CatIcon name={t.category_icon} size={11} className="flex-shrink-0" />
                      <span>{t.category_name}</span>
                    </>
                  )}
                  {!t.category_name && <span className="text-gray-300 dark:text-gray-600">· ไม่มีหมวด</span>}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {new Date(t.txn_at).toLocaleDateString('th-TH')}
                </p>
              </div>
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                <p className={`font-mono font-semibold ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString('th-TH')} ฿
                </p>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`} />
              </div>
            </div>

            {/* Expanded: category grid + actions */}
            {expandedId === t.id && (
              <div className="border-t dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-700/50">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {/* ตัวเลือกไม่มีหมวด */}
                  <button
                    onClick={() => changeCategory(t, null)}
                    className={`px-3 py-1.5 rounded-full text-[15px] border transition
                      ${!t.category_id
                        ? 'bg-gray-200 dark:bg-gray-600 border-gray-400 dark:border-gray-500 text-gray-800 dark:text-gray-100 font-medium'
                        : 'border-gray-200 dark:border-gray-600 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                  >ไม่มีหมวด</button>

                  {/* category icons — all, sorted by usage_count */}
                  {[...categories].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0)).map(c => (
                    <button
                      key={c.id}
                      onClick={() => changeCategory(t, c.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[15px] border transition
                        ${t.category_id === c.id
                          ? 'bg-indigo-100 dark:bg-indigo-900/60 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 font-medium'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                      <CatIcon name={c.icon} size={11} />
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); openEdit(t); setExpandedId(null) }}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  ><Pencil size={12} /> แก้ไขทั้งหมด</button>
                  <button
                    onClick={e => { e.stopPropagation(); remove(t.id) }}
                    className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400 hover:underline ml-2"
                  ><Trash2 size={12} /> ลบ</button>
                </div>
              </div>
            )}
          </div>
        ))}
            </div>
          </div>
        ))}
      </div>

      {/* infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-2 text-center text-xs text-gray-400">
        {loading && 'กำลังโหลด...'}
        {!loading && !hasMore && txns.length > 0 && 'แสดงทั้งหมดแล้ว'}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'แก้ไขรายการ' : 'เพิ่มรายการ'} onClose={close} onSave={save}>
          <TxnForm form={form} onChange={v => setForm(f => ({ ...f, ...v }))} accounts={accounts} categories={categories} />
        </Modal>
      )}
    </div>
  )
}

function TxnForm({ form, onChange, accounts, categories }) {
  const inputCls = "block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
      <label className="block">
        บัญชี
        <AccountSelect
          accounts={accounts}
          value={form.account_id}
          onChange={v => onChange({ account_id: v })}
          placeholder="เลือกบัญชี"
          className="mt-1"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div className="block">
          ประเภท
          <div className="flex rounded border dark:border-gray-600 overflow-hidden mt-1 text-sm">
            {[['income','📥 รายรับ'],['expense','📤 รายจ่าย']].map(([val, label]) => (
              <button key={val} type="button"
                onClick={() => onChange({ type: val })}
                className={`flex-1 py-1 ${form.type === val
                  ? val === 'income' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="block">
          จำนวนเงิน
          <CalcInput value={form.amount} onChange={v => onChange({ amount: v })} />
        </div>
      </div>
      <label className="block">
        รายละเอียด
        <input name="description" className={inputCls} value={form.description || ''} onChange={e => onChange({ description: e.target.value })} />
      </label>
      <div className="block text-sm">
        หมวดหมู่
        <CategorySelect
          categories={categories}
          value={form.category_id || ''}
          onChange={v => onChange({ category_id: v })}
          className="mt-1"
        />
      </div>
      <label className="block">
        วันที่ / เวลา
        <input type="datetime-local" className={inputCls} value={form.txn_at || ''} onChange={e => onChange({ txn_at: e.target.value })} />
      </label>
      <label className="block">
        แหล่งที่มา
        <input name="source" className={inputCls} value={form.source || ''} onChange={e => onChange({ source: e.target.value })} />
      </label>
      <EvidenceUpload value={form.evidence_url || ''} onChange={v => onChange({ evidence_url: v })} />
    </div>
  )
}

function CalcInput({ value, onChange }) {
  const [expr, setExpr] = useState(String(value || ''))
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  // sync ถ้า value เปลี่ยนจากนอก
  useEffect(() => {
    if (!open) setExpr(String(value || ''))
  }, [value, open])

  // keyboard support
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      const k = e.key
      if (k >= '0' && k <= '9') { e.preventDefault(); press(k) }
      else if (k === '.') { e.preventDefault(); press('.') }
      else if (k === '+') { e.preventDefault(); press('+') }
      else if (k === '-') { e.preventDefault(); press('-') }
      else if (k === '*') { e.preventDefault(); press('×') }
      else if (k === '/') { e.preventDefault(); press('÷') }
      else if (k === 'Backspace') { e.preventDefault(); press('⌫') }
      else if (k === 'Enter' || k === '=') { e.preventDefault(); press('✓') }
      else if (k === 'Escape') { e.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, expr])

  function press(key) {
    if (key === '⌫') {
      setExpr(e => e.slice(0, -1))
    } else if (key === '✓') {
      try {
        const result = Function('"use strict"; return (' + expr.replace(/×/g, '*').replace(/÷/g, '/') + ')')()
        const rounded = Math.round(result * 100) / 100
        onChange(rounded)
        setExpr(String(rounded))
      } catch {
        onChange(parseFloat(expr) || 0)
      }
      setOpen(false)
    } else {
      setExpr(e => e + key)
    }
  }

  // คำนวณ preview
  let preview = ''
  try {
    const r = Function('"use strict"; return (' + expr.replace(/×/g, '*').replace(/÷/g, '/') + ')')()
    if (isFinite(r) && String(r) !== expr) preview = '= ' + (Math.round(r * 100) / 100).toLocaleString('th-TH')
  } catch {}

  const rows = [
    ['7','8','9','×'],
    ['4','5','6','÷'],
    ['1','2','3','-'],
    ['.','0','⌫','+'],
  ]

  return (
    <div className="relative mt-1">
      <input
        inputMode="none"
        readOnly
        value={expr}
        onFocus={() => setOpen(true)}
        className="block w-full border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-pointer"
        placeholder="0"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-gray-100 dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
          {/* display */}
          <div className="px-3 py-2 text-right bg-white dark:bg-gray-800 border-b dark:border-gray-700">
            <p className="font-mono text-lg text-gray-900 dark:text-gray-100 min-h-6">{expr || '0'}</p>
            <p className="font-mono text-sm text-gray-400 min-h-5">{preview}</p>
          </div>
          {/* keypad */}
          <div className="grid grid-cols-4 gap-1 p-1.5">
            {rows.map((row, ri) => row.map(key => (
              <button
                key={`${ri}-${key}`}
                type="button"
                onClick={() => press(key)}
                className={`aspect-square text-base font-medium rounded-lg transition active:scale-95
                  ${key === '⌫'
                    ? 'bg-red-50 dark:bg-red-900/40 text-red-500 dark:text-red-400'
                    : ['+','-','×','÷'].includes(key)
                      ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400'
                      : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
              >{key}</button>
            )))}
            {/* ✓ */}
            <button
              type="button"
              onClick={() => press('✓')}
              className="col-span-4 py-2 text-base font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition"
            >✓</button>
          </div>
        </div>
      )}
      {/* overlay ปิด */}
      {open && <div className="fixed inset-0 z-40" onClick={() => { press('✓') }} />}
    </div>
  )
}

function EvidenceUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    // compress via canvas
    const img = await createImageBitmap(file)
    const MAX = 1200
    const scale = Math.min(1, MAX / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = img.width * scale
    canvas.height = img.height * scale
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async blob => {
      const fd = new FormData()
      fd.append('file', blob, file.name)
      const res = await fetch('/api/finance/upload', { method: 'POST', body: fd })
      const { url } = await res.json()
      onChange(url)
      setUploading(false)
    }, 'image/jpeg', 0.82)
  }

  return (
    <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
      <p className="mb-1">หลักฐาน</p>
      {value ? (
        <div className="mt-1 relative inline-block">
          <img src={value} alt="evidence"
            onClick={() => window.open(value, '_blank')}
            className="rounded-lg max-h-32 max-w-full object-contain border dark:border-gray-600 cursor-zoom-in" />
          <button type="button" onClick={() => onChange('')}
            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600">
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="mt-1 flex items-center gap-2 border dark:border-gray-600 rounded px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-400">
          <ImagePlus size={16} />
          <span className="text-sm">{uploading ? 'กำลังอัพโหลด...' : 'เลือกรูปภาพ'}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      )}
    </div>
  )
}

function Modal({ title, onClose, onSave, children }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
        </div>
        <div className="px-6 overflow-y-auto flex-1">{children}</div>
        <div className="flex justify-end gap-2 px-6 py-4 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-1.5 rounded border dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">ยกเลิก</button>
          <button onClick={onSave}  className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
        </div>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  return <Suspense><TransactionsContent /></Suspense>
}
