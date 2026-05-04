'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import ContactForm from './ContactForm.jsx'
import InteractionLogForm from './InteractionLogForm.jsx'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'
import { findSignalLabel } from '@/lib/callingSignals.js'

const CATEGORY_LABELS = {
  donor:     'ผู้บริจาค',
  prospect:  'คนสนใจ',
  volunteer: 'อาสาสมัคร',
  other:     'อื่นๆ',
}

const CATEGORY_COLORS = {
  donor:     { bg: '#cce5f4', text: '#0c447c' },
  prospect:  { bg: '#ead3ce', text: '#714b2b' },
  volunteer: { bg: '#d4edda', text: '#1a5e2d' },
  other:     { bg: '#f3f4f6', text: '#374151' },
}

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function formatThaiDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)}`
}

export default function ContactModal({ contactId, discordId, canManageAll, onClose, onDeleted }) {
  const [contact, setContact] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      const [cRes, lRes] = await Promise.all([
        fetch(`/api/calling/contacts/${contactId}`),
        fetch(`/api/calling/contacts/${contactId}/logs`),
      ])
      if (!cRes.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ')
      const cj = await cRes.json()
      const lj = await lRes.json()
      setContact(cj.data)
      setLogs(lj.data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [contactId])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleUpdate(form) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/calling/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'บันทึกไม่สำเร็จ') }
      await fetchAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/calling/contacts/${contactId}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'ลบไม่สำเร็จ') }
      onDeleted?.()
      onClose()
    } catch (e) { setError(e.message); setDeleting(false) }
  }

  const canDelete = canManageAll || (contact?.created_by != null && contact.created_by === discordId)
  const cat = contact ? (CATEGORY_COLORS[contact.category] || CATEGORY_COLORS.other) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}>
      <div className="w-full max-w-lg bg-card-bg rounded-xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-200 dark:border-disc-border shrink-0">
          <div className="min-w-0 flex-1">
            {loading ? (
              <span className="text-warm-400 dark:text-disc-muted text-base">กำลังโหลด…</span>
            ) : contact ? (
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">
                  {contact.first_name}{contact.last_name ? ` ${contact.last_name}` : ''}
                </h2>
                {contact.category && (
                  <span className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: cat.bg, color: cat.text }}>
                    {CATEGORY_LABELS[contact.category] || contact.category}
                  </span>
                )}
              </div>
            ) : null}
          </div>
          <button onClick={onClose}
            className="text-warm-400 hover:text-warm-700 dark:hover:text-disc-text text-2xl leading-none ml-3 shrink-0">
            ×
          </button>
        </div>

        {/* Tabs */}
        {!loading && contact && (
          <div className="flex border-b border-warm-200 dark:border-disc-border shrink-0">
            <button onClick={() => setTab('info')}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === 'info'
                  ? 'border-teal text-teal'
                  : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              ข้อมูล
            </button>
            <button onClick={() => setTab('history')}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === 'history'
                  ? 'border-teal text-teal'
                  : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              ประวัติ{logs.length > 0 ? ` (${logs.length})` : ''}
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm shrink-0">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">ปิด</button>
          </div>
        )}

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 text-center text-warm-400 dark:text-disc-muted">กำลังโหลด…</div>
          ) : !contact ? (
            <div className="py-12 text-center text-warm-400 dark:text-disc-muted">ไม่พบ contact</div>
          ) : tab === 'info' ? (
            <div className="p-5">
              <ContactForm
                initial={contact}
                onSubmit={handleUpdate}
                loading={saving}
              />
              {canDelete && (
                <div className="mt-4 pt-4 border-t border-warm-200 dark:border-disc-border">
                  {!deleteConfirm ? (
                    <button onClick={() => setDeleteConfirm(true)}
                      className="text-sm text-red-500 hover:text-red-700 dark:hover:text-red-400">
                      ลบ contact นี้
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm text-warm-700 dark:text-disc-text">
                        ยืนยันลบ {contact.first_name}?
                      </span>
                      <button onClick={handleDelete} disabled={deleting}
                        className="text-sm px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-50">
                        {deleting ? '…' : 'ลบเลย'}
                      </button>
                      <button onClick={() => setDeleteConfirm(false)}
                        className="text-sm text-warm-500 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text">
                        ยกเลิก
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <InteractionLogForm contactId={contact.id} onSaved={fetchAll} />
              {logs.length === 0 ? (
                <div className="text-center py-6 text-warm-400 dark:text-disc-muted text-base">ยังไม่มีบันทึก</div>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => {
                    const s = CALL_STATUS_COLORS[log.status] || { bg: '#f3f4f6', text: '#6b7280', label: log.status }
                    return (
                      <div key={log.id} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-3">
                        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded font-semibold"
                              style={{ background: s.bg, color: s.text }}>
                              {s.label}
                            </span>
                            <span className="text-base text-warm-500 dark:text-disc-muted">
                              {formatThaiDate(log.called_at)}
                            </span>
                            {log.caller_name && (
                              <span className="text-base text-warm-500 dark:text-disc-muted">โดย {log.caller_name}</span>
                            )}
                          </div>
                          {log.campaign_name && (
                            <Link href={`/calling/${log.campaign_id}`} onClick={onClose}
                              className="text-sm text-teal hover:underline truncate max-w-[60%]">
                              {log.campaign_name}
                            </Link>
                          )}
                        </div>
                        {log.note && (
                          <p className="text-base text-warm-900 dark:text-disc-text italic whitespace-pre-wrap">
                            "{log.note}"
                          </p>
                        )}
                        {(log.sig_location || log.sig_availability || log.sig_interest) && (
                          <div className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-warm-500 dark:text-disc-muted">
                            {log.sig_location     && <span>ที่อยู่: {findSignalLabel('sig_location', log.sig_location)}</span>}
                            {log.sig_availability && <span>เวลา: {findSignalLabel('sig_availability', log.sig_availability)}</span>}
                            {log.sig_interest     && <span>สนใจ: {findSignalLabel('sig_interest', log.sig_interest)}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
