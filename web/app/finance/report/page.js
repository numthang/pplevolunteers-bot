'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Suspense } from 'react'
import AccountSelect from '@/components/AccountSelect'
import CategorySelect, { CatIcon } from '@/components/CategorySelect'
import { formatThaiDateShort } from '@/lib/dateFormat'
import { X } from 'lucide-react'

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function fmt(n) {
  return Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function DescEdit({ txn, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(txn.description || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/finance/transactions/${txn.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...txn, description: val }),
    })
    setSaving(false)
    setEditing(false)
    onSaved(val)
  }

  if (editing) return (
    <div className="flex items-center gap-1">
      <input autoFocus className="text-sm border dark:border-gray-600 rounded px-2 py-0.5 flex-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} />
      <button onClick={save} disabled={saving} className="text-xs text-indigo-600 dark:text-indigo-400 px-1">บันทึก</button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-400 px-1">ยกเลิก</button>
    </div>
  )

  return (
    <div className="flex items-center gap-1 group/desc">
      <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{txn.description || '—'}</p>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover/desc:opacity-100 text-gray-400 hover:text-indigo-500 flex-shrink-0 transition-opacity">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </button>
    </div>
  )
}

// Modal แสดงรายการใน category
function CategoryModal({ catRow, filter, categories, onClose, onUpdated }) {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [sort, setSort] = useState('date_desc')

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const p = new URLSearchParams()
      if (filter.accountId) p.set('accountId', filter.accountId)
      if (filter.type)      p.set('type',      filter.type)
      // ถ้า catRow.category_id เป็น null → ส่ง noCategory=1
      if (catRow.category_id) p.set('categoryId', catRow.category_id)
      else p.set('noCategory', '1')
      if (filter.dateFrom)  p.set('dateFrom', filter.dateFrom)
      if (filter.dateTo)    p.set('dateTo',   filter.dateTo)
      if (filter.year)      p.set('year',     filter.year)
      if (filter.month)     p.set('month',    filter.month)
      p.set('limit', '2000')
      const res = await fetch('/api/finance/transactions?' + p)
      if (res.ok) setTxns(await res.json())
      setLoading(false)
    }
    load()
  }, [catRow])

  async function changeCategory(txn, newCatId) {
    setSaving(s => ({ ...s, [txn.id]: true }))
    await fetch(`/api/finance/transactions/${txn.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...txn, category_id: newCatId || null }),
    })
    setTxns(prev => prev.filter(t => t.id !== txn.id))
    setSaving(s => ({ ...s, [txn.id]: false }))
    onUpdated()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CatIcon name={catRow.category_icon} size={16} />
            <h2 className="font-bold text-gray-900 dark:text-gray-100">{catRow.category_name || 'ไม่มีหมวด'}</h2>
            <span className="text-sm text-gray-400">{catRow.type === 'income' ? '📥' : '📤'} {catRow.count} รายการ</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={sort} onChange={e => setSort(e.target.value)}
              className="border dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              <option value="date_desc">วันที่ ใหม่→เก่า</option>
              <option value="date_asc">วันที่ เก่า→ใหม่</option>
              <option value="amount_desc">ยอด มาก→น้อย</option>
              <option value="amount_asc">ยอด น้อย→มาก</option>
            </select>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
          </div>
        </div>

        <div className="px-5 overflow-y-auto flex-1">
          {loading
            ? <p className="text-center text-gray-400 py-8 text-sm">กำลังโหลด...</p>
            : txns.length === 0
              ? <p className="text-center text-gray-400 py-8 text-sm">ไม่มีรายการ</p>
              : <div className="space-y-2 pb-4">
                  {[...txns].sort((a, b) => {
                    if (sort === 'date_desc')   return new Date(b.txn_at) - new Date(a.txn_at)
                    if (sort === 'date_asc')    return new Date(a.txn_at) - new Date(b.txn_at)
                    if (sort === 'amount_desc') return Number(b.amount) - Number(a.amount)
                    if (sort === 'amount_asc')  return Number(a.amount) - Number(b.amount)
                    return 0
                  }).map((t, idx) => (
                    <div key={t.id} className="flex items-center gap-3 py-2 border-b dark:border-gray-700 last:border-0">
                      <span className="text-xs text-gray-400 w-7 text-right flex-shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <DescEdit txn={t} onSaved={desc => setTxns(prev => prev.map(x => x.id === t.id ? { ...x, description: desc } : x))} />
                        <p className="text-xs text-gray-400">{formatThaiDateShort(t.txn_at)} · {t.account_name}</p>
                      </div>
                      <p className={`font-mono text-sm font-semibold flex-shrink-0 ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {t.type === 'income' ? '+' : '-'}{fmt(t.amount)} ฿
                      </p>
                      <div className="flex-shrink-0 w-36">
                        <CategorySelect
                          categories={categories}
                          value={t.category_id || ''}
                          onChange={v => changeCategory(t, v)}
                          placeholder="เลือกหมวด"
                          disabled={saving[t.id]}
                        />
                      </div>
                    </div>
                  ))}
                </div>
          }
        </div>

        <div className="px-5 py-3 flex-shrink-0 border-t dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-1.5 rounded border dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">ปิด</button>
        </div>
      </div>
    </div>
  )
}

function ReportContent() {
  const now = new Date()
  const [accounts, setAccounts]     = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState({
    accountId: '',
    type: '',
    year:  String(now.getFullYear()),
    month: '',
    dateFrom: '',
    dateTo: '',
  })
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [modalCat, setModalCat] = useState(null)

  useEffect(() => {
    fetch('/api/finance/accounts').then(r => r.json()).then(setAccounts)
    fetch('/api/finance/categories').then(r => r.json()).then(setCategories)
  }, [])

  const fetchReport = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    Object.entries(filter).forEach(([k, v]) => { if (v) p.set(k, v) })
    const res = await fetch('/api/finance/report?' + p)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [filter])

  useEffect(() => { fetchReport() }, [filter])

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 5 + i)

  const cats        = data?.categories || []
  const trend       = data?.trend      || []
  const incomeRows  = cats.filter(r => r.type === 'income')
  const expenseRows = cats.filter(r => r.type === 'expense')
  const totalIncome  = incomeRows.reduce((s, r) => s + Number(r.total), 0)
  const totalExpense = expenseRows.reduce((s, r) => s + Number(r.total), 0)
  const net = totalIncome - totalExpense

  const trendMonths = [...new Set(trend.map(r => `${r.year}-${r.month}`))].sort().reverse()

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">รายงาน</h1>

      {/* Filters */}
      <div className="flex flex-col gap-2 mb-6">
        <AccountSelect accounts={accounts} value={filter.accountId} onChange={v => setFilter(f => ({ ...f, accountId: v }))} placeholder="ทุกบัญชี" className="w-full" />
        <div className="flex rounded border dark:border-gray-600 overflow-hidden text-sm">
          {[['', 'ทั้งหมด'], ['income', '📥 รายรับ'], ['expense', '📤 รายจ่าย']].map(([val, label]) => (
            <button key={val} type="button"
              onClick={() => setFilter(f => ({ ...f, type: val }))}
              className={`flex-1 px-3 py-1.5 ${filter.type === val ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >{label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="flex-1 border dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            value={filter.year} onChange={e => setFilter(f => ({ ...f, year: e.target.value, month: '', dateFrom: '', dateTo: '' }))}>
            <option value="">ทุกปี</option>
            {years.map(y => <option key={y} value={y}>{y + 543} ({y})</option>)}
          </select>
          <select className="flex-1 border dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            value={filter.month} onChange={e => setFilter(f => ({ ...f, month: e.target.value, dateFrom: '', dateTo: '' }))}>
            <option value="">ทุกเดือน</option>
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <span>หรือ</span>
          <input type="date" className="flex-1 min-w-0 border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            value={filter.dateFrom} onChange={e => setFilter(f => ({ ...f, dateFrom: e.target.value, year: '', month: '' }))} />
          <span>–</span>
          <input type="date" className="flex-1 min-w-0 border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
            value={filter.dateTo} onChange={e => setFilter(f => ({ ...f, dateTo: e.target.value, year: '', month: '' }))} />
        </div>
      </div>

      {loading && <p className="text-gray-400 text-sm mb-4">กำลังโหลด...</p>}

      {/* Summary bar */}
      {data && (
        <div className="flex flex-col gap-3 mb-6">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'รายรับ',  value: totalIncome,  cls: 'text-green-600 dark:text-green-400' },
              { label: 'รายจ่าย', value: totalExpense, cls: 'text-red-500 dark:text-red-400' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-white dark:bg-gray-800 rounded-xl shadow px-3 py-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
                <p className={`font-mono font-bold text-lg leading-tight ${cls}`}>{fmt(value)} ฿</p>
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow px-3 py-3 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">สุทธิ</p>
            <p className={`font-mono font-bold text-lg leading-tight ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>{fmt(net)} ฿</p>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {[{ label: '📥 รายรับตามหมวด', rows: incomeRows, total: totalIncome, barCls: 'bg-green-500' },
            { label: '📤 รายจ่ายตามหมวด', rows: expenseRows, total: totalExpense, barCls: 'bg-red-500' }]
            .filter(g => g.rows.length > 0 || !filter.type)
            .map(({ label, rows, total, barCls }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{label}</h2>
              {rows.length === 0
                ? <p className="text-gray-400 text-sm text-center py-4">ไม่มีข้อมูล</p>
                : <div className="space-y-2">
                    {rows.map(r => {
                      const pct = total > 0 ? (Number(r.total) / total) * 100 : 0
                      return (
                        <button key={`${r.category_id}-${r.type}`} type="button"
                          onClick={() => setModalCat(r)}
                          className="w-full text-left group hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded px-1 -mx-1 transition">
                          <div className="flex items-center justify-between text-sm mb-0.5">
                            <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              <CatIcon name={r.category_icon} size={13} />
                              {r.category_name || 'ไม่มีหมวด'}
                              <span className="text-xs text-gray-400">({r.count})</span>
                            </span>
                            <span className="font-mono text-gray-900 dark:text-gray-100 text-xs">{fmt(r.total)} ฿</span>
                          </div>
                          <div className="h-1.5 rounded bg-gray-100 dark:bg-gray-700">
                            <div className={`h-1.5 rounded ${barCls}`} style={{ width: `${pct.toFixed(1)}%` }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
              }
            </div>
          ))}
        </div>
      )}

      {/* Monthly trend */}
      {data && trendMonths.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">แนวโน้มรายเดือน</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b dark:border-gray-700">
                  <th className="text-left pb-2">เดือน</th>
                  <th className="text-right pb-2 text-green-600 dark:text-green-400">รายรับ</th>
                  <th className="text-right pb-2 text-red-500 dark:text-red-400">รายจ่าย</th>
                  <th className="text-right pb-2">สุทธิเดือนนี้</th>
                </tr>
              </thead>
              <tbody>
                {trendMonths.map(key => {
                  const [y, m] = key.split('-').map(Number)
                  const inc = trend.find(r => r.year === y && r.month === m && r.type === 'income')
                  const exp = trend.find(r => r.year === y && r.month === m && r.type === 'expense')
                  const i = Number(inc?.total || 0)
                  const e = Number(exp?.total || 0)
                  const n = i - e
                  return (
                    <tr key={key} className="border-b dark:border-gray-700 last:border-0">
                      <td className="py-2 text-gray-700 dark:text-gray-300">{MONTHS[m-1]} {y + 543}</td>
                      <td className="py-2 text-right font-mono text-green-600 dark:text-green-400">{i > 0 ? fmt(i) : '—'}</td>
                      <td className="py-2 text-right font-mono text-red-500 dark:text-red-400">{e > 0 ? fmt(e) : '—'}</td>
                      <td className={`py-2 text-right font-mono font-semibold ${n >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                        {n >= 0 ? '' : '-'}{fmt(Math.abs(n))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Category drill-down modal */}
      {modalCat && (
        <CategoryModal
          catRow={modalCat}
          filter={filter}
          categories={categories}
          onClose={() => setModalCat(null)}
          onUpdated={fetchReport}
        />
      )}
    </div>
  )
}

export default function ReportPage() {
  return <Suspense><ReportContent /></Suspense>
}
