'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import ContactForm from '@/components/calling/ContactForm.jsx'
import geographyData from '@/lib/thailand-geography.json'

const PROVINCE_LIST = geographyData.map(p => p.province)

function getProvinceFromRoles(roles = []) {
  const matches = roles.map(r => r.startsWith('ทีม') ? r.slice(3) : '').filter(p => PROVINCE_LIST.includes(p))
  return matches.length === 1 ? matches[0] : ''
}

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

export default function ContactsPage() {
  const { data: session } = useSession()
  const { roles } = useEffectiveRoles(session)
  const defaultProvince = session?.user?.primary_province || getProvinceFromRoles(roles)

  const [contacts, setContacts]         = useState([])
  const [contactsHidden, setContactsHidden] = useState(false)
  const [loading, setLoading]           = useState(true)
  const [keyword, setKeyword]           = useState('')
  const [modal, setModal]               = useState(null)  // null | 'new' | { contact }
  const [saving, setSaving]             = useState(false)
  const [deleting, setDeleting]         = useState(null)
  const [error, setError]               = useState('')

  useEffect(() => {
    if (!modal) return
    function onKey(e) { if (e.key === 'Escape') setModal(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modal])

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (keyword) params.set('keyword', keyword)
      const res = await fetch(`/api/calling/contacts?${params}`)
      const json = await res.json()
      setContacts(json.data || [])
      setContactsHidden(json.contacts_hidden || false)
    } catch { setError('โหลดข้อมูลไม่สำเร็จ') }
    finally { setLoading(false) }
  }, [keyword])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  async function handleCreate(form) {
    setSaving(true)
    try {
      const res = await fetch('/api/calling/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'เกิดข้อผิดพลาด') }
      setModal(null)
      await fetchContacts()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleUpdate(form) {
    setSaving(true)
    try {
      const res = await fetch(`/api/calling/contacts/${modal.contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'เกิดข้อผิดพลาด') }
      setModal(null)
      await fetchContacts()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(contact) {
    if (!confirm(`ลบ ${contact.first_name} ใช่ไหม?`)) return
    setDeleting(contact.id)
    try {
      const res = await fetch(`/api/calling/contacts/${contact.id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'ลบไม่สำเร็จ') }
      await fetchContacts()
    } catch (e) { setError(e.message) }
    finally { setDeleting(null) }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Contacts</h1>
        <button onClick={() => setModal('new')}
          className="px-4 py-2 text-sm rounded-lg bg-teal hover:bg-teal-dark text-white">
          + เพิ่ม Contact
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">ปิด</button>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800"
          placeholder="ค้นหาชื่อ เบอร์โทร หรือ email…"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลด…</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">ยังไม่มี contact</div>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const cat = CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other
            return (
              <div key={c.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      {c.first_name}
                    </span>
                    {c.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: cat.bg, color: cat.text }}>
                        {CATEGORY_LABELS[c.category] || c.category}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-x-3">
                    {c.province && <span>{[c.province, c.amphoe?.replace(/^อำเภอ/, ''), c.tambon].filter(Boolean).join(' › ')}</span>}
                    {!contactsHidden && c.phone   && <span>📞 {c.phone}</span>}
                    {!contactsHidden && c.line_id && <span>LINE: {c.line_id}</span>}
                  </div>
                  {c.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-1">{c.note}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setModal({ contact: c })}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
                    แก้ไข
                  </button>
                  <button onClick={() => handleDelete(c)} disabled={deleting === c.id}
                    className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                    {deleting === c.id ? '…' : 'ลบ'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setModal(null)}>
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {modal === 'new' ? 'เพิ่ม Contact' : `แก้ไข — ${modal.contact.first_name}`}
              </h2>
              <button onClick={() => setModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">
                ×
              </button>
            </div>
            <ContactForm
              initial={modal === 'new' ? { province: defaultProvince, category: 'prospect' } : modal.contact}
              onSubmit={modal === 'new' ? handleCreate : handleUpdate}
              onCancel={() => setModal(null)}
              loading={saving}
            />
          </div>
        </div>
      )}
    </div>
  )
}
