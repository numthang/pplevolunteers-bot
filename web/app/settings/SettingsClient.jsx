'use client'
import { useState } from 'react'

export default function SettingsClient({ accounts }) {
  const [saving, setSaving] = useState(null)
  const [local, setLocal] = useState(
    Object.fromEntries(accounts.map(a => [a.id, { notify_income: a.notify_income, notify_expense: a.notify_expense }]))
  )

  async function save(accountId) {
    setSaving(accountId)
    const account = accounts.find(a => a.id === accountId)
    await fetch(`/api/finance/accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...account, ...local[accountId] }),
    })
    setSaving(null)
  }

  function toggle(accountId, field) {
    setLocal(prev => ({
      ...prev,
      [accountId]: { ...prev[accountId], [field]: prev[accountId][field] ? 0 : 1 },
    }))
  }

  if (accounts.length === 0) {
    return <p className="text-gray-400">ยังไม่มีบัญชีที่จัดการได้</p>
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">การแจ้งเตือน</h2>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow divide-y dark:divide-gray-700">
        {accounts.map(a => (
          <div key={a.id} className="px-5 py-4">
            <p className="font-medium mb-2 text-gray-900 dark:text-gray-100">{a.name}</p>
            <div className="flex gap-6 text-sm text-gray-700 dark:text-gray-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!local[a.id]?.notify_income}
                  onChange={() => toggle(a.id, 'notify_income')}
                />
                แจ้งรายรับ
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!local[a.id]?.notify_expense}
                  onChange={() => toggle(a.id, 'notify_expense')}
                />
                แจ้งรายจ่าย
              </label>
              <button
                onClick={() => save(a.id)}
                disabled={saving === a.id}
                className="ml-auto text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40 text-sm"
              >
                {saving === a.id ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
