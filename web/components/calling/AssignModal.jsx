'use client'

import { useState } from 'react'

export default function AssignModal({ isOpen, selectedCount, onClose, onConfirm }) {
  const [assignTo, setAssignTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleConfirm = async () => {
    if (!assignTo.trim()) {
      alert('กรุณาระบุชื่อผู้รับผิดชอบ')
      return
    }
    setIsLoading(true)
    try {
      await onConfirm(assignTo.trim())
    } finally {
      setIsLoading(false)
      setAssignTo('')
    }
  }

  const handleClose = () => {
    setAssignTo('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-warm-dark-100 rounded-lg shadow-lg max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-warm-200 dark:border-warm-dark-200">
          <h2 className="text-lg font-medium text-warm-900 dark:text-warm-50">
            มอบหมายสมาชิก
          </h2>
          <button
            onClick={handleClose}
            className="text-warm-400 dark:text-warm-dark-400 hover:text-warm-900 dark:hover:text-warm-50 text-xl"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-base font-medium text-warm-700 dark:text-warm-50 mb-2">
              ชื่อผู้รับผิดชอบ *
            </label>
            <input
              type="text"
              value={assignTo}
              onChange={e => setAssignTo(e.target.value)}
              placeholder="Discord display name หรือชื่อ"
              className="w-full h-11 px-3 text-base border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal placeholder-warm-400 dark:placeholder-warm-dark-400"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            />
          </div>

          {selectedCount > 0 && (
            <p className="text-base text-warm-600 dark:text-warm-dark-400 bg-warm-50 dark:bg-warm-dark-200 p-3 rounded">
              กำลังมอบหมาย <strong>{selectedCount}</strong> คน ให้ <strong>{assignTo || 'ผู้รับผิดชอบ'}</strong>
            </p>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-warm-200 dark:border-warm-dark-200">
            <button
              onClick={handleConfirm}
              disabled={!assignTo.trim() || isLoading}
              className="flex-1 px-4 py-3 bg-teal hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition"
            >
              {isLoading ? 'กำลังมอบหมาย...' : 'ยืนยัน'}
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-3 border border-warm-200 dark:border-warm-dark-300 text-warm-900 dark:text-warm-50 text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
