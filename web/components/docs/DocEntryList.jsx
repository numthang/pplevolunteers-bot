'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Check, X } from 'lucide-react'

const ITEM_LABELS = {
  food:          'ค่าอาหาร',
  speaker:       'ค่าวิทยากร',
  travel:        'ค่าเดินทาง',
  venue:         'ค่าสถานที่',
  accommodation: 'ค่าที่พัก',
  supplies:      'ค่าวัสดุสิ้นเปลือง',
  equipment:     'ค่าอุปกรณ์',
  photo:         'ค่าถ่ายภาพ',
}
const ALL_ITEMS    = Object.keys(ITEM_LABELS)
const MOBILE_ITEMS = ['food','travel','accommodation','supplies','equipment','photo']

const STATUS_LABEL = { pending: 'รอเซ็น', signed: 'เซ็นแล้ว', printed: 'พิมพ์แล้ว' }
const STATUS_COLOR  = {
  pending: 'bg-warm-100 text-warm-500 dark:bg-disc-hover dark:text-disc-muted',
  signed:  'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  printed: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
}
const PAYER_SIGNED_CLS   = 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
const PAYER_UNSIGNED_CLS = 'bg-warm-100 text-warm-500 dark:bg-disc-hover dark:text-disc-muted'

const inputCls = 'border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange'

export default function DocEntryList({ initialEntries, isMobile, canManage, onAddClick }) {
  const [entries, setEntries] = useState(initialEntries)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditForm({ itemType: entry.item_type, description: entry.description || '', amount: entry.amount })
  }

  function cancelEdit() { setEditingId(null); setEditForm({}) }

  async function saveEdit(entryId) {
    setSaving(true)
    try {
      const res = await fetch(`/api/docs/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType:    editForm.itemType,
          description: editForm.description || null,
          amount:      parseFloat(editForm.amount),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEntries(prev => prev.map(e =>
        e.id === entryId
          ? { ...e, item_type: editForm.itemType, description: editForm.description || null, amount: editForm.amount }
          : e
      ))
      setEditingId(null)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entryId) {
    if (!confirm('ลบรายการนี้?')) return
    try {
      const res = await fetch(`/api/docs/entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      setEntries(prev => prev.filter(e => e.id !== entryId))
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const byMember = {}
  for (const e of entries) {
    const key = e.member_discord_id
    if (!byMember[key]) {
      const realName = [e.ngs_first_name, e.ngs_last_name].filter(Boolean).join(' ')
      byMember[key] = { name: e.display_name || e.member_discord_id, realName, items: [] }
    }
    byMember[key].items.push(e)
  }

  const allowedItems = isMobile ? MOBILE_ITEMS : ALL_ITEMS

  if (entries.length === 0) {
    return (
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center">
        <p className="text-warm-500 dark:text-disc-muted mb-4">ยังไม่มีรายการเบิก</p>
        {canManage && onAddClick && (
          <button onClick={onAddClick} className="text-orange hover:underline text-base font-medium">
            เพิ่มรายการ →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Object.values(byMember).map(({ name, realName, items }) => {
        const memberTotal = items.reduce((s, e) => s + Number(e.amount || 0), 0)
        return (
          <div key={items[0].member_discord_id} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-warm-200 dark:border-disc-border flex items-center justify-between">
              <span className="font-semibold text-warm-900 dark:text-disc-text">
                {name}
                {realName && <span className="ml-1.5 text-sm font-normal text-warm-500 dark:text-disc-muted">({realName})</span>}
              </span>
              <span className="text-sm text-warm-500 dark:text-disc-muted">{memberTotal.toLocaleString()} บ.</span>
            </div>
            <div className="divide-y divide-warm-100 dark:divide-disc-border">
              {items.map(entry => {
                const isEditing = editingId === entry.id
                return (
                  <div key={entry.id} className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={editForm.itemType}
                          onChange={e => setEditForm(f => ({ ...f, itemType: e.target.value }))}
                          className={`${inputCls} w-36`}
                        >
                          {allowedItems.map(t => <option key={t} value={t}>{ITEM_LABELS[t]}</option>)}
                        </select>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="หมายเหตุ"
                          className={`${inputCls} flex-1 min-w-0`}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.amount}
                          onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                          className={`${inputCls} w-24`}
                        />
                        <button
                          onClick={() => saveEdit(entry.id)}
                          disabled={saving}
                          className="p-1.5 rounded text-green-600 dark:text-green-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-base text-warm-900 dark:text-disc-text">
                            {ITEM_LABELS[entry.item_type] || entry.item_type}
                          </div>
                          {entry.description && (
                            <div className="text-sm text-warm-500 dark:text-disc-muted truncate">{entry.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text">
                            {Number(entry.amount).toLocaleString()} บ.
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[entry.status] || STATUS_COLOR.pending}`}>
                            {STATUS_LABEL[entry.status] || entry.status}
                          </span>
                          {entry.status === 'pending' && entry.sign_token && (
                            <Link href={`/docs/sign/${entry.sign_token}`} className="text-xs text-teal hover:underline" target="_blank">
                              ลิงก์เซ็น
                            </Link>
                          )}
                          {entry.payer_sign_token && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${entry.payer_signed_at ? PAYER_SIGNED_CLS : PAYER_UNSIGNED_CLS}`}>
                              {entry.payer_signed_at ? 'จ่าย ✓' : 'จ่าย ✗'}
                            </span>
                          )}
                          {entry.payer_sign_token && !entry.payer_signed_at && (
                            <Link href={`/docs/sign/${entry.payer_sign_token}`} className="text-xs text-blue-500 hover:underline" target="_blank">
                              ลิงก์จ่าย
                            </Link>
                          )}
                          {(entry.status === 'signed' || entry.status === 'printed') && (
                            <a href={`/api/docs/entries/${entry.id}/pdf?mark=printed`} target="_blank" className="text-xs text-orange hover:underline">
                              PDF
                            </a>
                          )}
                          {canManage && (
                            <>
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                                title="แก้ไข"
                              >
                                <Pencil size={13} />
                              </button>
                              {entry.status === 'pending' && (
                                <button
                                  onClick={() => handleDelete(entry.id)}
                                  className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                                  title="ลบ"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
