'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import ContactForm from '@/components/calling/ContactForm.jsx'
import ContactModal from '@/components/calling/ContactModal.jsx'
import geographyData from '@/lib/thailand-geography.json'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/../config/callingCategories.js'

const PROVINCE_LIST = geographyData.map(p => p.province)

function getProvinceFromRoles(roles = []) {
  const matches = roles.map(r => r.startsWith('ทีม') ? r.slice(3) : '').filter(p => PROVINCE_LIST.includes(p))
  return matches[0] || ''
}

const MANAGE_ROLES = ['Admin', 'เลขาธิการ', 'ผู้ประสานงานภาค', 'รองเลขาธิการ', 'ผู้ประสานงานจังหวัด', 'กรรมการจังหวัด']

export default function ContactsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { roles, discordId } = useEffectiveRoles(session)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])
  const defaultProvince = session?.user?.primary_province || getProvinceFromRoles(roles)
  const canManageAll = roles.some(r => MANAGE_ROLES.includes(r))

  const [contacts, setContacts]             = useState([])
  const [contactsHidden, setContactsHidden] = useState(false)
  const [loading, setLoading]               = useState(true)
  const [keyword, setKeyword]               = useState('')
  const [modal, setModal]                   = useState(null)  // null | 'new' | { id: number }
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-warm-900 dark:text-disc-text">Contacts</h1>
        <button onClick={() => setModal('new')}
          className="px-4 py-2 text-base font-medium rounded-lg bg-teal hover:opacity-90 text-white">
          + เพิ่ม Contact
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">ปิด</button>
        </div>
      )}

      <div className="mb-4">
        <input
          className="w-full h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg dark:bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
          placeholder="ค้นหาชื่อ เบอร์โทร หรือ LINE…"
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-warm-400 dark:text-disc-muted text-base">กำลังโหลด…</div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12 text-warm-400 dark:text-disc-muted text-base">ยังไม่มี contact</div>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const cat = CATEGORY_COLORS[c.category] || CATEGORY_COLORS.other
            const location = [c.province, c.amphoe?.replace(/^อำเภอ/, ''), c.tambon].filter(Boolean).join(' › ')
            return (
              <button key={c.id} onClick={() => setModal({ id: c.id })}
                className="block w-full text-left p-4 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover transition">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-warm-900 dark:text-disc-text text-base">
                    {c.first_name}{c.last_name ? ` ${c.last_name}` : ''}
                  </span>
                  {c.category && (
                    <span className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{ background: cat.bg, color: cat.text }}>
                      {CATEGORY_LABELS[c.category] || c.category}
                    </span>
                  )}
                </div>
                {c.specialty && (
                  <div className="text-base text-warm-700 dark:text-disc-text mt-0.5 line-clamp-1">{c.specialty}</div>
                )}
                <div className="text-base text-warm-500 dark:text-disc-muted mt-0.5 flex flex-wrap gap-x-3">
                  {location && <span>{location}</span>}
                  {!contactsHidden && c.phone   && <span className="text-teal font-medium">{c.phone}</span>}
                  {!contactsHidden && c.line_id && <span>LINE: {c.line_id}</span>}
                </div>
                {c.note && <p className="text-base text-warm-500 dark:text-disc-muted mt-0.5 line-clamp-1 italic">"{c.note}"</p>}
              </button>
            )
          })}
        </div>
      )}

      {/* Contact edit/view modal */}
      {modal && modal !== 'new' && (
        <ContactModal
          contactId={modal.id}
          discordId={discordId}
          canManageAll={canManageAll}
          onClose={() => setModal(null)}
          onSaved={fetchContacts}
          onDeleted={() => { setModal(null); fetchContacts() }}
        />
      )}

      {/* New contact modal */}
      {modal === 'new' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setModal(null)}>
          <div className="w-full max-w-lg bg-card-bg rounded-xl shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 dark:border-disc-border">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">เพิ่ม Contact</h2>
              <button onClick={() => setModal(null)}
                className="text-warm-400 hover:text-warm-700 dark:hover:text-disc-text text-2xl leading-none">×</button>
            </div>
            <div className="p-6">
              <ContactForm
                initial={{ province: defaultProvince, category: 'prospect' }}
                onSubmit={handleCreate}
                onCancel={() => setModal(null)}
                loading={saving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
