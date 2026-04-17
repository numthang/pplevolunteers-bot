'use client'

import { useState } from 'react'
import UserCombobox from './UserCombobox.jsx'

export default function SplitModal({ isOpen, unassignedCount, onClose, onConfirm }) {
  const [assignees, setAssignees] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const perPerson = assignees.length > 0 ? Math.ceil(unassignedCount / assignees.length) : 0

  const handleConfirm = async () => {
    if (assignees.length === 0) return
    setIsLoading(true)
    try {
      await onConfirm(assignees.map(u => u.discord_id))
    } finally {
      setIsLoading(false)
      setAssignees([])
    }
  }

  const handleClose = () => {
    setAssignees([])
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-warm-dark-100 rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-warm-200 dark:border-warm-dark-200">
          <h2 className="text-lg font-medium text-warm-900 dark:text-warm-50">แบ่งงาน</h2>
          <button onClick={handleClose} className="text-warm-400 hover:text-warm-900 dark:hover:text-warm-50 text-xl">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-warm-600 dark:text-warm-dark-400 bg-warm-50 dark:bg-warm-dark-200 px-4 py-2.5 rounded-lg">
            สมาชิกที่ยังไม่ได้มอบหมาย: <strong>{unassignedCount} คน</strong>
          </div>

          <div>
            <label className="block text-sm font-medium text-warm-700 dark:text-warm-50 mb-2">
              ผู้รับผิดชอบ
            </label>
            <UserCombobox
              value={assignees}
              onChange={setAssignees}
              placeholder="ค้นหาชื่อผู้รับผิดชอบ..."
            />
          </div>

          {assignees.length > 0 && unassignedCount > 0 && (
            <div className="border border-warm-200 dark:border-warm-dark-300 rounded-lg divide-y divide-warm-100 dark:divide-warm-dark-300 text-sm">
              {assignees.map((u, i) => {
                const from = i * perPerson + 1
                const to = Math.min((i + 1) * perPerson, unassignedCount)
                return (
                  <div key={u.discord_id} className="flex items-center justify-between px-3 py-2">
                    <span className="font-medium text-warm-900 dark:text-warm-50">{u.display_name}</span>
                    <span className="text-warm-400 dark:text-warm-dark-400">
                      {to - from + 1} คน (#{from}–#{to})
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-warm-200 dark:border-warm-dark-200">
            <button
              onClick={handleConfirm}
              disabled={assignees.length === 0 || unassignedCount === 0 || isLoading}
              className="flex-1 px-4 py-2.5 bg-teal hover:opacity-90 text-white font-medium rounded-lg disabled:opacity-40 transition"
            >
              {isLoading ? 'กำลังมอบหมาย...' : `ยืนยัน (${assignees.length} คน)`}
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2.5 border border-warm-200 dark:border-warm-dark-300 text-warm-900 dark:text-warm-50 font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
