'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import CategorySelect, { CatIcon } from '@/components/CategorySelect'
import AccountSelect from '@/components/AccountSelect'
import { Pencil, Trash2, ImagePlus, X } from 'lucide-react'
import BankBadge from '@/components/BankBadge'

function TransactionsContent() {
  const searchParams = useSearchParams()
  const defaultAccountId = searchParams.get('accountId') || ''

  const [txns, setTxns]         = useState([])
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [filter, setFilter]     = useState({ accountId: defaultAccountId, type: '', categoryId: '' })
  const [editing, setEditing]   = useState(null)
  const [form, setForm]         = useState({})

  function toLocalDT(d = new Date()) {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const EMPTY_FORM = { account_id: defaultAccountId, type: 'income', amount: '', description: '', category_id: '', source: '', txn_at: toLocalDT() }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">รายการธุรกรรม</h1>
        <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + เพิ่มรายการ
        </button>
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
        {txns.map(t => (
          <div key={t.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 select-none"
            onClick={() => openEdit(t)}
          >
            {/* Bank badge */}
            <BankBadge bank={t.account_bank} size={32} />
            {/* Evidence thumbnail */}
            {t.evidence_url && (
              <img src={t.evidence_url} alt="" onClick={e => { e.stopPropagation(); window.open(t.evidence_url, '_blank') }}
                className="w-10 h-10 rounded object-cover flex-shrink-0 border dark:border-gray-600 cursor-zoom-in" />
            )}

            {/* ข้อมูลหลัก */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{t.description || '—'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                {t.account_name}
                {t.category_name && (
                  <>
                    <span>·</span>
                    <CatIcon name={t.category_icon} size={11} className="flex-shrink-0" />
                    <span>{t.category_name}</span>
                  </>
                )}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {new Date(t.txn_at).toLocaleDateString('th-TH')}
              </p>
            </div>

            {/* จำนวน + delete */}
            <div className="text-right flex-shrink-0">
              <p className={`font-mono font-semibold ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {t.type === 'income' ? '+' : '-'}฿{Number(t.amount).toLocaleString('th-TH')}
              </p>
              <button
                onClick={e => { e.stopPropagation(); remove(t.id) }}
                className="p-1 rounded text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/40 mt-1"
              ><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
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
        <label className="block">
          จำนวนเงิน
          <input type="number" className={inputCls} value={form.amount} onChange={e => onChange({ amount: e.target.value })} />
        </label>
      </div>
      <label className="block">
        รายละเอียด
        <textarea rows={3} className={inputCls} value={form.description || ''} onChange={e => onChange({ description: e.target.value })} />
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
        <input className={inputCls} value={form.source || ''} onChange={e => onChange({ source: e.target.value })} />
      </label>
      <EvidenceUpload value={form.evidence_url || ''} onChange={v => onChange({ evidence_url: v })} />
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
    <div className="block text-sm text-gray-700 dark:text-gray-300 mt-1">
      หลักฐาน
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
        <h2 className="text-lg font-bold px-6 pt-6 pb-2 text-gray-900 dark:text-gray-100 flex-shrink-0">{title}</h2>
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
