'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function TransactionsContent() {
  const searchParams = useSearchParams()
  const defaultAccountId = searchParams.get('accountId') || ''

  const [txns, setTxns]         = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter]     = useState({ accountId: defaultAccountId, type: '', categoryId: '' })
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState({})

  const EMPTY_FORM = { account_id: defaultAccountId, type: 'income', amount: '', description: '', category_id: '', source: '', txn_at: new Date().toISOString().slice(0, 16) }

  useEffect(() => {
    fetch('/api/finance/accounts').then(r => r.json()).then(setAccounts)
    fetch('/api/finance/categories').then(r => r.json()).then(setCategories)
  }, [])

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filter.accountId)  p.set('accountId',  filter.accountId)
    if (filter.type)       p.set('type',        filter.type)
    if (filter.categoryId) p.set('categoryId',  filter.categoryId)
    fetch('/api/finance/transactions?' + p).then(r => r.json()).then(setTxns)
  }, [filter])

  useEffect(() => { load() }, [load])

  function openNew()  { setForm({ ...EMPTY_FORM }); setEditing({}) }
  function openEdit(t){ setForm({ ...t, txn_at: new Date(t.txn_at).toISOString().slice(0, 16) }); setEditing(t) }
  function close()    { setEditing(null) }

  async function save() {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">รายการธุรกรรม</h1>
        <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + เพิ่มรายการ
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select className="border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200" value={filter.accountId} onChange={e => setFilter(f => ({ ...f, accountId: e.target.value }))}>
          <option value="">ทุกบัญชี</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200" value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}>
          <option value="">ทุกประเภท</option>
          <option value="income">รายรับ</option>
          <option value="expense">รายจ่าย</option>
        </select>
        <select className="border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200" value={filter.categoryId} onChange={e => setFilter(f => ({ ...f, categoryId: e.target.value }))}>
          <option value="">ทุกหมวด</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-left">
            <tr>
              <th className="px-4 py-3">วันที่</th>
              <th className="px-4 py-3">บัญชี</th>
              <th className="px-4 py-3">รายการ</th>
              <th className="px-4 py-3">หมวด</th>
              <th className="px-4 py-3 text-right">จำนวน</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => (
              <tr key={t.id} className="border-t dark:border-gray-700">
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{new Date(t.txn_at).toLocaleDateString('th-TH')}</td>
                <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{t.account_name}</td>
                <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{t.description}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{t.category_name || '—'}</td>
                <td className={`px-4 py-2 text-right font-mono ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString('th-TH')}
                </td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => openEdit(t)} className="text-indigo-600 dark:text-indigo-400 hover:underline mr-2">แก้ไข</button>
                  <button onClick={() => remove(t.id)} className="text-red-500 dark:text-red-400 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
            {txns.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">ไม่มีรายการ</td></tr>
            )}
          </tbody>
        </table>
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
        <select className={inputCls} value={form.account_id} onChange={e => onChange({ account_id: e.target.value })}>
          <option value="">เลือกบัญชี</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          ประเภท
          <select className={inputCls} value={form.type} onChange={e => onChange({ type: e.target.value })}>
            <option value="income">รายรับ</option>
            <option value="expense">รายจ่าย</option>
          </select>
        </label>
        <label className="block">
          จำนวนเงิน
          <input type="number" className={inputCls} value={form.amount} onChange={e => onChange({ amount: e.target.value })} />
        </label>
      </div>
      <label className="block">
        รายละเอียด
        <input className={inputCls} value={form.description || ''} onChange={e => onChange({ description: e.target.value })} />
      </label>
      <label className="block">
        หมวดหมู่
        <select className={inputCls} value={form.category_id || ''} onChange={e => onChange({ category_id: e.target.value })}>
          <option value="">ไม่ระบุ</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block">
        วันที่ / เวลา
        <input type="datetime-local" className={inputCls} value={form.txn_at || ''} onChange={e => onChange({ txn_at: e.target.value })} />
      </label>
      <label className="block">
        แหล่งที่มา
        <input className={inputCls} value={form.source || ''} onChange={e => onChange({ source: e.target.value })} />
      </label>
      <label className="block">
        URL หลักฐาน
        <input className={inputCls} value={form.evidence_url || ''} onChange={e => onChange({ evidence_url: e.target.value })} />
      </label>
    </div>
  )
}

function Modal({ title, onClose, onSave, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 mt-5">
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
