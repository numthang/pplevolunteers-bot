'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import RecordCallModal from '@/components/calling/RecordCallModal.jsx'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'

const TIER_COLORS = {
  A: { bg: '#ead3ce', text: '#714b2b' },
  B: { bg: '#cce5f4', text: '#0c447c' },
  C: { bg: '#faeeda', text: '#854f0b' },
  D: { bg: '#fcebeb', text: '#a32d2d' },
}

const RSVP_ICONS = {
  yes:   { icon: '✓', color: '#0d9e94' },
  no:    { icon: '✗', color: '#a32d2d' },
  maybe: { icon: '?', color: '#854f0b' },
}

function getExpiryBadge(expiredAt) {
  if (!expiredAt) return null
  const now = Date.now()
  const exp = new Date(expiredAt).getTime()
  if (exp < now) return { label: 'หมดอายุ', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' }
  if (exp - now < 90 * 24 * 60 * 60 * 1000) return { label: 'ใกล้หมด', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' }
  return null
}

function getStatusBadge(callStatus, logStatus) {
  if (callStatus === 'pending') return CALL_STATUS_COLORS.pending
  return CALL_STATUS_COLORS[logStatus] || CALL_STATUS_COLORS.pending
}

const STATUS_OPTIONS = [
  { value: '',        label: 'ทั้งหมด' },
  { value: 'pending', label: 'รอโทร' },
  { value: 'called',  label: 'โทรแล้ว' },
]

export default function PendingCallsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [campaigns, setCampaigns] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCampaign, setFilterCampaign] = useState(() => searchParams.get('campaign') || '')
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') ?? '')
  const [filterRsvp, setFilterRsvp] = useState(() => searchParams.get('rsvp') || '')

  const [modalMember, setModalMember] = useState(null)
  const [modalIndex, setModalIndex] = useState(-1)

  const membersRef = useRef([])
  useEffect(() => { membersRef.current = members }, [members])

  useEffect(() => {
    const p = new URLSearchParams()
    if (filterCampaign) p.set('campaign', filterCampaign)
    if (filterStatus)   p.set('status', filterStatus)
    if (filterRsvp)     p.set('rsvp', filterRsvp)
    const qs = p.toString()
    router.replace(qs ? `/calling/pending?${qs}` : '/calling/pending', { scroll: false })
  }, [filterCampaign, filterStatus, filterRsvp])

  useEffect(() => {
    fetch('/api/calling/pending?campaigns=true')
      .then(r => r.json())
      .then(d => setCampaigns(d.data || []))
      .catch(() => {})
  }, [])

  const fetchMembers = useCallback(async (campaignId, status, rsvp) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '200' })
      if (campaignId) p.set('campaignId', campaignId)
      if (status) p.set('status', status)
      if (rsvp) p.set('rsvp', rsvp)
      const res = await fetch(`/api/calling/pending?${p}`)
      const data = await res.json()
      setMembers(data.data || [])
    } catch (err) {
      console.error('fetchMembers', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers(filterCampaign, filterStatus, filterRsvp)
  }, [filterCampaign, filterStatus, filterRsvp, fetchMembers])

  const openModal = (member) => {
    const idx = membersRef.current.findIndex(
      m => m.source_id === member.source_id && m.campaign_id === member.campaign_id
    )
    setModalMember(member)
    setModalIndex(idx)
  }

  const closeModal = () => {
    setModalMember(null)
    setModalIndex(-1)
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && modalMember) closeModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modalMember])

  const findNextPendingIndex = useCallback((fromIndex) => {
    const list = membersRef.current
    for (let i = fromIndex + 1; i < list.length; i++) {
      if (list[i].call_status === 'pending') return i
    }
    return -1
  }, [])

  const hasNext = modalIndex >= 0 && findNextPendingIndex(modalIndex) >= 0

  const markMemberCalled = (sourceId, campaignId) => {
    setMembers(prev => prev.map(m =>
      m.source_id === sourceId && m.campaign_id === campaignId
        ? { ...m, call_status: 'called', camp_calls: (m.camp_calls || 0) + 1 }
        : m
    ))
  }

  const submitLog = async (payload) => {
    const res = await fetch('/api/calling/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'เกิดข้อผิดพลาด')
    }
    if (payload.rsvp) {
      await fetch('/api/calling/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: payload.campaign_id,
          member_id: payload.member_id,
          rsvp: payload.rsvp,
        }),
      })
    }
    return res.json()
  }

  const handleSave = async (payload) => {
    try {
      await submitLog(payload)
      closeModal()
      fetchMembers(filterCampaign, filterStatus, filterRsvp)
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  const handleSaveAndNext = async (payload) => {
    try {
      await submitLog(payload)
      markMemberCalled(modalMember.source_id, modalMember.campaign_id)
      const updatedList = membersRef.current.map(m =>
        m.source_id === modalMember.source_id && m.campaign_id === modalMember.campaign_id
          ? { ...m, call_status: 'called' }
          : m
      )
      const nextIdx = updatedList.findIndex((m, i) => i > modalIndex && m.call_status === 'pending')
      if (nextIdx >= 0) {
        setModalMember(updatedList[nextIdx])
        setModalIndex(nextIdx)
      } else {
        closeModal()
        fetchMembers(filterCampaign, filterStatus, filterRsvp)
      }
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  const totalPending = members.filter(m => m.call_status === 'pending').length
  const totalCalled  = members.filter(m => m.call_status === 'called').length
  const total = members.length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-warm-50 mb-1">Pending calls</h1>
        <p className="text-base text-warm-500 dark:text-warm-dark-500">รายชื่อสมาชิกที่ได้รับ assign มาให้คุณโทร</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="h-11 px-3 text-base border border-warm-200 dark:border-warm-dark-300 bg-card-bg text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none"
        >
          <option value="">Campaign (ทั้งหมด)</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-warm-200 dark:border-warm-dark-300 overflow-hidden shrink-0">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-4 py-2.5 text-base font-medium whitespace-nowrap transition ${
                filterStatus === opt.value
                  ? 'bg-teal text-white'
                  : 'bg-card-bg text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={filterRsvp}
          onChange={e => setFilterRsvp(e.target.value)}
          className="h-11 px-3 text-base border border-warm-200 dark:border-warm-dark-300 bg-card-bg text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none"
        >
          <option value="">RSVP (ทั้งหมด)</option>
          <option value="yes">✓ เข้าร่วม</option>
          <option value="no">✗ ไม่เข้าร่วม</option>
          <option value="maybe">? อาจจะ</option>
        </select>
      </div>

      {/* Stats bar */}
      {!loading && total > 0 && (
        <div className="flex gap-6 mb-5 text-base">
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">ทั้งหมด:</span>
            <span className="ml-1.5 font-semibold text-warm-900 dark:text-warm-50">{total}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">รอโทร:</span>
            <span className="ml-1.5 font-semibold text-orange-600">{totalPending}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">โทรแล้ว:</span>
            <span className="ml-1.5 font-semibold text-teal">{totalCalled}</span>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-base">กำลังโหลด...</div>
      ) : members.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-warm-dark-300 rounded-xl py-16 text-center text-warm-400 dark:text-warm-dark-400 text-base">
          {filterStatus === 'pending' ? 'โทรครบทุกคนแล้ว 🎉' : 'ไม่มีรายการ'}
        </div>
      ) : (
        <div className="bg-card-bg border border-warm-200 dark:border-warm-dark-300 rounded-xl overflow-hidden">
          {/* Table header — desktop only */}
          <div className="hidden sm:grid items-center px-4 py-2.5 gap-2 bg-warm-100 dark:bg-warm-dark-200 border-b border-warm-200 dark:border-warm-dark-300 text-sm font-medium text-warm-500 dark:text-warm-dark-500 [grid-template-columns:1fr_40px_80px_100px]">
            <span>ชื่อสมาชิก</span>
            <span className="text-center">ระดับ</span>
            <span className="text-center">รับสาย</span>
            <span>สถานะ</span>
          </div>

          <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
            {members.map(member => {
              const tier = member.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const expiryBadge = getExpiryBadge(member.expired_at)

              return (
                <button
                  key={`${member.source_id}-${member.campaign_id}`}
                  onClick={() => openModal(member)}
                  className="w-full text-left px-4 py-4 hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition group"
                >
                  {/* Mobile layout */}
                  <div className="sm:hidden">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-base font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                          >{tier}</span>
                          <span className="text-base font-medium text-warm-900 dark:text-warm-50 group-hover:text-teal transition-colors truncate">
                            {member.full_name}
                          </span>
                          {expiryBadge && <span className={`text-base font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-base truncate mt-0.5">
                          {(member.home_amphure || member.campaign_name) && (
                            <span className="text-warm-400 dark:text-warm-dark-400 truncate">
                              {[member.home_amphure, member.campaign_name].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        {member.latest_note && (
                          <div className="text-base text-warm-600 dark:text-warm-200 mt-1 truncate italic">
                            "{member.latest_note}"
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {(() => {
                          const badge = getStatusBadge(member.call_status, member.latest_log_status)
                          return (
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 rounded text-base font-medium whitespace-nowrap"
                                style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
                              {member.rsvp && (
                                <span className="text-base font-bold" style={{ color: RSVP_ICONS[member.rsvp]?.color || '#666' }}>
                                  {RSVP_ICONS[member.rsvp]?.icon || member.rsvp}
                                </span>
                              )}
                            </div>
                          )
                        })()}
                        <span className="text-base text-warm-400 dark:text-warm-dark-400">
                          {member.answered_count}/{member.total_calls} รับ
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:grid items-center [grid-template-columns:1fr_40px_80px_100px] gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-medium text-warm-900 dark:text-warm-50 group-hover:text-teal transition-colors truncate">
                            {member.full_name}
                          </span>
                          {expiryBadge && <span className={`text-base font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-base truncate">
                          {(member.home_amphure || member.campaign_name) && (
                            <span className="text-warm-400 dark:text-warm-dark-400 truncate">
                              {[member.home_amphure, member.campaign_name].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        {member.latest_note && (
                          <div className="text-base text-warm-600 dark:text-warm-200 mt-0.5 truncate italic">
                            "{member.latest_note}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <span
                        className="text-base font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                      >{tier}</span>
                    </div>

                    <div className="text-center text-base text-warm-500 dark:text-warm-dark-500">
                      <span className="font-semibold text-warm-900 dark:text-warm-50">{member.answered_count}</span>
                      <span className="text-warm-300 dark:text-warm-dark-500">/</span>
                      <span>{member.total_calls}</span>
                    </div>

                    <div className="flex items-center gap-1 justify-start">
                      {(() => {
                        const badge = getStatusBadge(member.call_status, member.latest_log_status)
                        return (
                          <>
                            <span className="px-2 py-0.5 rounded text-base font-medium whitespace-nowrap"
                              style={{ backgroundColor: badge.bg, color: badge.text }}>
                              {badge.label}
                            </span>
                            {member.rsvp && (
                              <span className="text-base font-bold" style={{ color: RSVP_ICONS[member.rsvp]?.color || '#666' }}>
                                {RSVP_ICONS[member.rsvp]?.icon || member.rsvp}
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <RecordCallModal
        isOpen={!!modalMember}
        member={modalMember}
        onClose={closeModal}
        onSave={handleSave}
        onSaveAndNext={handleSaveAndNext}
        hasNext={hasNext}
      />
    </div>
  )
}
