'use client'
import { useEffect, useState } from 'react'

const BANKS = [
  'กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'กรุงศรีอยุธยา',
  'ทหารไทยธนชาต', 'ออมสิน', 'ธ.ก.ส.',
]

const EMPTY = { name: '', bank: '', account_no: '', visibility: 'private', notify_income: 1, notify_expense: 1, email_inbox: '' }

export default function AccountsPage() {
  const [accounts, setAccounts] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)

  async function load() {
    const res = await fetch('/api/finance/accounts')
    if (res.ok) setAccounts(await res.json())
  }

  useEffect(() => { load() }, [])

  function openNew()   { setForm(EMPTY); setEditing({}) }
  function openEdit(a) { setForm({ ...a }); setEditing(a) }
  function close()     { setEditing(null) }

  async function save() {
    const isNew = !editing?.id
    const res = await fetch(isNew ? '/api/finance/accounts' : `/api/finance/accounts/${editing.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { close(); load() }
  }

  async function remove(id) {
    if (!confirm('ลบบัญชีนี้?')) return
    await fetch(`/api/finance/accounts/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">บัญชี</h1>
        <button onClick={openNew} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">
          + เพิ่มบัญชี
        </button>
      </div>

      <div className="space-y-3">
        {accounts.map(a => (
          <div key={a.id} className="bg-white dark:bg-gray-800 rounded-xl shadow px-5 py-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{a.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{a.bank} · {a.account_no}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(a)} className="text-sm text-indigo-600 hover:underline">แก้ไข</button>
              <button onClick={() => remove(a.id)} className="text-sm text-red-500 hover:underline">ลบ</button>
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <Modal title={editing.id ? 'แก้ไขบัญชี' : 'เพิ่มบัญชี'} onClose={close} onSave={save}>
          <AccountForm form={form} onChange={v => setForm(f => ({ ...f, ...v }))} />
        </Modal>
      )}
    </div>
  )
}

function AccountForm({ form, onChange }) {
  const selectCls = "block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
  return (
    <div className="space-y-3 text-gray-700 dark:text-gray-300">
      <Field label="ชื่อบัญชี" value={form.name} onChange={v => onChange({ name: v })} />
      <label className="block text-sm">
        ธนาคาร
        <select
          className={selectCls}
          value={form.bank || ''}
          onChange={e => onChange({ bank: e.target.value })}
        >
          <option value="">-- เลือกธนาคาร --</option>
          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>
      <Field label="เลขบัญชี" value={form.account_no} onChange={v => onChange({ account_no: v })} placeholder="ใส่ได้ทั้งมี - และไม่มี" />
      <label className="text-sm">
        การมองเห็น
        <select className={selectCls} value={form.visibility} onChange={e => onChange({ visibility: e.target.value })}>
          <option value="private">ส่วนตัว — เห็นแค่เจ้าของ</option>
          <option value="internal">ภายใน — เห็นทุกคนในองค์กร</option>
          <option value="public">สาธารณะ — เห็นได้จากภายนอก</option>
        </select>
      </label>
      <Field label="Email Inbox (optional)" value={form.email_inbox} onChange={v => onChange({ email_inbox: v })} />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.notify_income} onChange={e => onChange({ notify_income: e.target.checked ? 1 : 0 })} />
          แจ้งรายรับ
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.notify_expense} onChange={e => onChange({ notify_expense: e.target.checked ? 1 : 0 })} />
          แจ้งรายจ่าย
        </label>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className="block w-full border dark:border-gray-600 rounded px-2 py-1 mt-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
        value={value || ''}
        placeholder={placeholder || ''}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

function Modal({ title, onClose, onSave, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        {children}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-1.5 rounded border text-sm">ยกเลิก</button>
          <button onClick={onSave} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
        </div>
      </div>
    </div>
  )
}
