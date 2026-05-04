'use client'

import { useEffect, useState, useCallback, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ContactForm from '@/components/calling/ContactForm.jsx'
import InteractionLogForm from '@/components/calling/InteractionLogForm.jsx'
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

export default function ContactDetailPage({ params }) {
  const { id } = use(params)
  const router = useRouter()

  const [contact, setContact] = useState(null)
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [error, setError]           = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [contactRes, logsRes] = await Promise.all([
        fetch(`/api/calling/contacts/${id}`),
        fetch(`/api/calling/contacts/${id}/logs`),
      ])
      if (!contactRes.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ')
      const cj = await contactRes.json()
      const lj = await logsRes.json()
      setContact(cj.data)
      setLogs(lj.data || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (!editing) return
    function onKey(e) { if (e.key === 'Escape') setEditing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  async function handleUpdate(form) {
    setSaving(true)
    try {
      const res = await fetch(`/api/calling/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'บันทึกไม่สำเร็จ') }
      setEditing(false)
      await fetchAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/calling/contacts/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'ลบไม่สำเร็จ') }
      router.push('/contacts')
    } catch (e) { setError(e.message); setDeleting(false) }
  }

  if (loading) {
    return <div className="py-12 text-center text-warm-400 dark:text-disc-muted">กำลังโหลด…</div>
  }
  if (!contact) {
    return <div className="py-12 text-center text-warm-400 dark:text-disc-muted">ไม่พบ contact</div>
  }

  const cat = CATEGORY_COLORS[contact.category] || CATEGORY_COLORS.other
  const location = [contact.province, contact.amphoe?.replace(/^อำเภอ/, ''), contact.tambon].filter(Boolean).join(' › ')
  const fullName = `${contact.first_name}${contact.last_name ? ` ${contact.last_name}` : ''}`

  return (
    <div>
      <div className="mb-4">
        <Link href="/contacts" className="text-base text-teal hover:underline">← กลับไปรายการ</Link>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">ปิด</button>
        </div>
      )}

      {/* ส่วนข้อมูล */}
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-5 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-warm-900 dark:text-disc-text">{fullName}</h1>
              {contact.category && (
                <span className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ background: cat.bg, color: cat.text }}>
                  {CATEGORY_LABELS[contact.category] || contact.category}
                </span>
              )}
            </div>
            {location && <div className="text-base text-warm-500 dark:text-disc-muted mt-1">{location}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button onClick={() => setEditing(true)}
              className="text-sm px-3 py-1.5 rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover">
              แก้ไข
            </button>
            {!deleteConfirm ? (
              <button onClick={() => setDeleteConfirm(true)}
                className="text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                ลบ
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-warm-700 dark:text-disc-text">ยืนยัน?</span>
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
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-base">
          {contact.phone && (
            <div>
              <dt className="text-sm text-warm-500 dark:text-disc-muted">เบอร์โทร</dt>
              <dd><a href={`tel:${contact.phone}`} className="text-teal font-medium">{contact.phone}</a></dd>
            </div>
          )}
          {contact.line_id && (
            <div>
              <dt className="text-sm text-warm-500 dark:text-disc-muted">LINE ID</dt>
              <dd className="text-warm-900 dark:text-disc-text">{contact.line_id}</dd>
            </div>
          )}
          {contact.specialty && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-warm-500 dark:text-disc-muted">อาชีพ / ตำแหน่ง / ความสามารถ</dt>
              <dd className="text-warm-900 dark:text-disc-text whitespace-pre-wrap">{contact.specialty}</dd>
            </div>
          )}
          {contact.note && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-warm-500 dark:text-disc-muted">หมายเหตุ</dt>
              <dd className="text-warm-900 dark:text-disc-text italic whitespace-pre-wrap">"{contact.note}"</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ส่วน Interaction Log */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">บันทึกการพบปะ / ประวัติ</h2>

        <InteractionLogForm contactId={contact.id} onSaved={fetchAll} />

        {logs.length === 0 ? (
          <div className="text-center py-8 text-warm-400 dark:text-disc-muted text-base">ยังไม่มีบันทึก</div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => {
              const s = CALL_STATUS_COLORS[log.status] || { bg: '#f3f4f6', text: '#6b7280', label: log.status }
              return (
                <div key={log.id} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded font-semibold" style={{ background: s.bg, color: s.text }}>{s.label}</span>
                      <span className="text-base text-warm-500 dark:text-disc-muted">{formatThaiDate(log.called_at)}</span>
                      {log.caller_name && <span className="text-base text-warm-500 dark:text-disc-muted">โดย {log.caller_name}</span>}
                    </div>
                    {log.campaign_name && (
                      <Link href={`/calling/${log.campaign_id}`} className="text-sm text-teal hover:underline truncate max-w-[60%]">
                        {log.campaign_name}
                      </Link>
                    )}
                  </div>
                  {log.note && (
                    <p className="text-base text-warm-900 dark:text-disc-text italic whitespace-pre-wrap">"{log.note}"</p>
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

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setEditing(false)}>
          <div className="w-full max-w-lg bg-card-bg rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 dark:border-disc-border">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">แก้ไข — {contact.first_name}</h2>
              <button onClick={() => setEditing(false)}
                className="text-warm-400 hover:text-warm-700 dark:hover:text-disc-text text-2xl leading-none">×</button>
            </div>
            <div className="p-6">
              <ContactForm
                initial={contact}
                onSubmit={handleUpdate}
                onCancel={() => setEditing(false)}
                loading={saving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
