'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import AccountFormFields from './AccountFormFields'

const EMPTY = { name: '', bank: '', account_no: '', visibility: 'private', province: '', notify_income: 1, notify_expense: 1, email_inbox: '', guild_id: '' }

export default function AddAccountButton() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [guilds, setGuilds] = useState([])

  useEffect(() => {
    fetch('/api/admin/guilds').then(r => r.ok ? r.json() : []).then(setGuilds)
  }, [])

  async function save() {
    if (!form.name?.trim()) return alert('กรุณาใส่ชื่อบัญชี')
    const res = await fetch('/api/finance/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { setShowModal(false); setForm(EMPTY); router.refresh() }
  }

  return (
    <>
      <button
        onClick={() => { setForm(EMPTY); setShowModal(true) }}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
      >
        + เพิ่มบัญชี
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">เพิ่มบัญชี</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <AccountFormFields form={form} onChange={v => setForm(f => ({ ...f, ...v }))} guilds={guilds} />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 rounded border dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">ยกเลิก</button>
              <button onClick={save} className="px-4 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
