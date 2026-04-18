'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import RecordCallModal from '@/components/calling/RecordCallModal.jsx'

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

function getStatusBadge(logStatus) {
  switch (logStatus) {
    case 'answered':     return { bg: '#e1f5f4', text: '#0d9e94', label: 'รับสาย' }
    case 'no_answer':    return { bg: '#faeeda', text: '#854f0b', label: 'ไม่รับ' }
    case 'wrong_number': return { bg: '#fcebeb', text: '#a32d2d', label: 'เบอร์ผิด' }
    default:             return { bg: '#f3f4f6', text: '#6b7280', label: 'รอโทร' }
  }
}

const STATUS_OPTIONS = [
  { value: '',        label: 'ทั้งหมด' },
  { value: 'pending', label: 'รอโทร' },
  { value: 'called',  label: 'โทรแล้ว' },
]

export default function PendingCallsPage() {
  const [campaigns, setCampaigns] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterStatus, setFilterStatus] = useState('pending')
  const [filterRsvp, setFilterRsvp] = useState('')

  const [modalMember, setModalMember] = useState(null)
  const [modalIndex, setModalIndex] = useState(-1)

  const membersRef = useRef([])
  useEffect(() => { membersRef.current = members }, [members])

  // Fetch my campaigns
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

  // Next pending member after current index
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
    return res.json()
  }

  const handleSave = async (payload) => {
    try {
      await submitLog(payload)
      markMemberCalled(modalMember.source_id, modalMember.campaign_id)
      closeModal()
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  const handleSaveAndNext = async (payload) => {
    try {
      await submitLog(payload)
      markMemberCalled(modalMember.source_id, modalMember.campaign_id)

      // Re-read updated list from ref (state update is async)
      const updatedList = membersRef.current.map(m =>
        m.source_id === modalMember.source_id && m.campaign_id === modalMember.campaign_id
          ? { ...m, call_status: 'called' }
          : m
      )
      // Find next pending in updated list
      const nextIdx = updatedList.findIndex((m, i) => i > modalIndex && m.call_status === 'pending')
      if (nextIdx >= 0) {
        setModalMember(updatedList[nextIdx])
        setModalIndex(nextIdx)
      } else {
        closeModal()
      }
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  // Stats
  const totalPending = members.filter(m => m.call_status === 'pending').length
  const totalCalled  = members.filter(m => m.call_status === 'called').length
  const total = members.length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-warm-50 mb-1">Pending calls</h1>
        <p className="text-sm text-warm-500 dark:text-warm-dark-500">รายชื่อสมาชิกที่ได้รับ assign มาให้คุณโทร</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">Campaign (ทั้งหมด)</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-warm-200 dark:border-warm-dark-300 overflow-hidden">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-4 py-2 text-sm font-medium transition ${
                filterStatus === opt.value
                  ? 'bg-teal text-white'
                  : 'bg-white dark:bg-warm-dark-100 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={filterRsvp}
          onChange={e => setFilterRsvp(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">RSVP (ทั้งหมด)</option>
          <option value="yes">✓ เข้าร่วม</option>
          <option value="no">✗ ไม่เข้าร่วม</option>
          <option value="maybe">? อาจจะ</option>
        </select>
      </div>

      {/* Stats bar */}
      {!loading && total > 0 && (
        <div className="flex gap-6 mb-5 text-sm">
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
        <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-sm">กำลังโหลด...</div>
      ) : members.length === 0 ? (
        <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl py-16 text-center text-warm-400 dark:text-warm-dark-400 text-sm">
          {filterStatus === 'pending' ? 'โทรครบทุกคนแล้ว 🎉' : 'ไม่มีรายการ'}
        </div>
      ) : (
        <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid items-center px-4 py-2.5 gap-2 bg-warm-100 dark:bg-warm-dark-200 border-b border-warm-200 dark:border-warm-dark-300 text-xs font-medium text-warm-500 dark:text-warm-dark-500 [grid-template-columns:1fr_40px_80px_100px]">
            <span>ชื่อสมาชิก</span>
            <span className="text-center">ระดับ</span>
            <span className="text-center">รับสาย</span>
            <span>สถานะ</span>
          </div>

          <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
            {members.map(member => {
              const tier = member.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const isCalled = member.call_status === 'called'
              const avatarChar = member.first_name?.[0] || member.full_name?.[0] || '?'

              return (
                <button
                  key={`${member.source_id}-${member.campaign_id}`}
                  onClick={() => openModal(member)}
                  className="w-full text-left px-4 py-3.5 hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition group"
                >
                  {/* Mobile layout: single column */}
                  <div className="sm:hidden">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                      >{avatarChar}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-warm-900 dark:text-warm-50 group-hover:text-teal transition-colors truncate">
                            {member.full_name}
                          </span>
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                          >{tier}</span>
                        </div>
                        <div className="text-xs text-warm-400 dark:text-warm-dark-400 truncate">
                          {member.home_amphure || ''}{member.campaign_name ? ` · ${member.campaign_name}` : ''}
                        </div>
                        {member.latest_note && (
                          <div className="text-xs text-warm-500 dark:text-warm-dark-500 mt-1 truncate italic">
                            "{member.latest_note}"
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          {(() => {
                            const badge = getStatusBadge(member.latest_log_status)
                            return (
                              <>
                                <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                                  style={{ backgroundColor: badge.bg, color: badge.text }}>
                                  {badge.label}
                                </span>
                                {member.rsvp && (
                                  <span className="text-sm font-bold" style={{ color: RSVP_ICONS[member.rsvp]?.color || '#666' }}>
                                    {RSVP_ICONS[member.rsvp]?.icon || member.rsvp}
                                  </span>
                                )}
                              </>
                            )
                          })()}
                        </div>
                        <span className="text-xs text-warm-400 dark:text-warm-dark-400">
                          {member.answered_count}/{member.total_calls} รับ
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout: grid */}
                  <div className="hidden sm:grid items-center [grid-template-columns:1fr_40px_80px_100px] gap-2">
                    {/* Name + meta */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                      >{avatarChar}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-warm-900 dark:text-warm-50 group-hover:text-teal transition-colors truncate">
                          {member.full_name}
                        </div>
                        <div className="text-xs text-warm-400 dark:text-warm-dark-400 truncate">
                          {[member.mobile_number, member.home_amphure, member.campaign_name].filter(Boolean).join(' · ')}
                        </div>
                        {member.latest_note && (
                          <div className="text-xs text-warm-500 dark:text-warm-dark-500 mt-0.5 truncate italic">
                            "{member.latest_note}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tier */}
                    <div className="flex justify-center">
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                      >{tier}</span>
                    </div>

                    {/* Answered/Total */}
                    <div className="text-center text-xs text-warm-500 dark:text-warm-dark-500">
                      <span className="font-semibold text-warm-900 dark:text-warm-50">{member.answered_count}</span>
                      <span className="text-warm-300 dark:text-warm-dark-500">/</span>
                      <span>{member.total_calls}</span>
                    </div>

                    {/* Status + RSVP */}
                    <div className="flex items-center gap-1 justify-start">
                      {(() => {
                        const badge = getStatusBadge(member.latest_log_status)
                        return (
                          <>
                            <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                              style={{ backgroundColor: badge.bg, color: badge.text }}>
                              {badge.label}
                            </span>
                            {member.rsvp && (
                              <span className="text-sm font-bold" style={{ color: RSVP_ICONS[member.rsvp]?.color || '#666' }}>
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
