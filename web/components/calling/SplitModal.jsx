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
      <div className="bg-white dark:bg-disc-hover rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-lg font-medium text-warm-900 dark:text-disc-text">แบ่งงาน</h2>
          <button onClick={handleClose} className="text-warm-400 hover:text-warm-900 dark:hover:text-disc-text text-2xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-disc-hover transition">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-base text-warm-600 dark:text-disc-muted bg-warm-50 dark:bg-disc-header px-4 py-3 rounded-lg">
            สมาชิกที่ยังไม่ได้มอบหมาย: <strong>{unassignedCount} คน</strong>
          </div>

          <div>
            <label className="block text-base font-medium text-warm-700 dark:text-disc-text mb-2">
              ผู้รับผิดชอบ
            </label>
            <UserCombobox
              value={assignees}
              onChange={setAssignees}
              placeholder="ค้นหาชื่อผู้รับผิดชอบ..."
            />
          </div>

          {assignees.length > 0 && unassignedCount > 0 && (
            <div className="border border-warm-200 dark:border-disc-border rounded-lg divide-y divide-warm-100 dark:divide-disc-border text-base">
              {assignees.map((u, i) => {
                const from = i * perPerson + 1
                const to = Math.min((i + 1) * perPerson, unassignedCount)
                return (
                  <div key={u.discord_id} className="flex items-center justify-between px-3 py-2.5">
                    <span className="font-medium text-warm-900 dark:text-disc-text">{u.display_name}</span>
                    <span className="text-warm-400 dark:text-disc-muted">
                      {to - from + 1} คน (#{from}–#{to})
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-warm-200 dark:border-disc-border">
            <button
              onClick={handleConfirm}
              disabled={assignees.length === 0 || unassignedCount === 0 || isLoading}
              className="flex-1 px-4 py-3 bg-teal hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition"
            >
              {isLoading ? 'กำลังมอบหมาย...' : `ยืนยัน (${assignees.length} คน)`}
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-3 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover transition"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
