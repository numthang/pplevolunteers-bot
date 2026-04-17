'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import Link from 'next/link'
import SplitModal from '@/components/calling/SplitModal.jsx'

const PAGE_SIZE = 50

const TIER_COLORS = {
  A: { bg: '#ead3ce', text: '#714b2b', darkBg: '#3d2318', darkText: '#d4a48a' },
  B: { bg: '#cce5f4', text: '#0c447c', darkBg: '#0c2640', darkText: '#7bbfec' },
  C: { bg: '#faeeda', text: '#854f0b', darkBg: '#3a2308', darkText: '#d4953e' },
  D: { bg: '#fcebeb', text: '#a32d2d', darkBg: '#3a1212', darkText: '#d47373' },
}

export default function CampaignPage({ params }) {
  const { campaignId } = use(params)
  const [campaign, setCampaign] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [usersMap, setUsersMap] = useState({})
  const [filterAssignee, setFilterAssignee] = useState('')
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  // Fetch campaign + members
  useEffect(() => {
    fetchData()
  }, [campaignId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [campaignRes, memberRes, usersRes] = await Promise.all([
        fetch('/api/calling/campaigns'),
        fetch(`/api/calling/members?campaignId=${campaignId}&limit=5000`),
        fetch('/api/calling/users')
      ])
      const campaignData = await campaignRes.json()
      const camp = campaignData.data?.find(c => c.id === parseInt(campaignId))
      if (camp) setCampaign(camp)

      const memberData = await memberRes.json()
      if (memberData.data) setMembers(memberData.data)
      setSelectedMembers(new Set())

      const usersData = await usersRes.json()
      if (usersData.data) {
        const map = {}
        for (const u of usersData.data) map[u.discord_id] = u.display_name
        setUsersMap(map)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filters
  const filteredMembers = members.filter(m => {
    if (filterDistrict && m.home_amphure !== filterDistrict) return false
    if (filterTier && (m.tier || 'D') !== filterTier) return false
    if (filterStatus) {
      const status = m.member_status || 'unassigned'
      if (filterStatus !== status) return false
    }
    if (filterAssignee && m.assigned_to !== filterAssignee) return false
    return true
  })

  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMembers.length

  // Reset visible when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filterDistrict, filterTier, filterStatus, filterAssignee])

  // Infinite scroll
  const handleObserver = useCallback((entries) => {
    if (entries[0].isIntersecting && hasMore) {
      setVisibleCount(c => c + PAGE_SIZE)
    }
  }, [hasMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleObserver])

  // Handlers
  const handleSelectAll = () => {
    if (selectedMembers.size === filteredMembers.length) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(filteredMembers.map(m => m.source_id)))
    }
  }

  const handleSelectMember = (memberId) => {
    const newSet = new Set(selectedMembers)
    if (newSet.has(memberId)) newSet.delete(memberId)
    else newSet.add(memberId)
    setSelectedMembers(newSet)
  }

  const handleSplit = async (assigneeIds) => {
    try {
      const targets = selectedMembers.size > 0
        ? members.filter(m => selectedMembers.has(m.source_id))
        : members.filter(m => m.member_status === 'unassigned')
      const perPerson = Math.ceil(targets.length / assigneeIds.length)
      await Promise.all(
        assigneeIds.map((discordId, i) => {
          const chunk = targets.slice(i * perPerson, (i + 1) * perPerson)
          if (chunk.length === 0) return Promise.resolve()
          return fetch('/api/calling/assignments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaign_id: parseInt(campaignId),
              member_ids: chunk.map(m => m.source_id),
              assigned_to: discordId
            })
          })
        })
      )
      setSplitModalOpen(false)
      await fetchData()
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    }
  }

  const handleUnassign = async () => {
    if (!confirm(\`ยกเลิกมอบหมาย \${selectedMembers.size} คน?\`)) return
    try {
      await Promise.all(
        Array.from(selectedMembers).map(memberId =>
          fetch('/api/calling/assignments', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: parseInt(campaignId), member_id: memberId })
          })
        )
      )
      await fetchData()
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    }
  }

  // Districts, tiers, assignees
  const districts = [...new Set(members.map(m => m.home_amphure).filter(Boolean))].sort()
  const tiers = ['A', 'B', 'C', 'D']
  const assignees = [...new Set(members.filter(m => m.assigned_to).map(m => m.assigned_to))]
    .map(id => ({ id, name: usersMap[id] || id }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Stats
  const totalMembers = members.length
  const calledCount = members.filter(m => m.total_calls > 0).length
  const assignedCount = members.filter(m => m.assigned_to).length
  const unassignedCount = members.filter(m => m.member_status === 'unassigned').length

  // Status badge styles
  const getStatusBadge = (status) => {
    switch (status) {
      case 'called':
        return { bg: '#e1f5f4', text: '#0d9e94', label: 'โทรแล้ว' }
      case 'assigned':
        return { bg: '#e0e7ff', text: '#4f46e5', label: 'มอบหมายแล้ว' }
      default:
        return { bg: '#faeeda', text: '#854f0b', label: 'รอมอบหมาย' }
    }
  }

  const isAllSelected = selectedMembers.size === filteredMembers.length && filteredMembers.length > 0

  if (loading) {
    return (
      <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-sm">
        กำลังโหลด...
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="py-20 text-center text-red-500">
        ไม่พบแคมเปญ
      </div>
    )
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-warm-500 dark:text-warm-dark-500">
        <Link href="/calling" className="text-teal hover:underline">
          Campaigns
        </Link>
        <span className="mx-2">›</span>
        <span className="text-warm-900 dark:text-warm-50">{campaign.name}</span>
      </div>

      {/* Campaign Header Card */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-lg p-6 mb-8">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-warm-50 mb-2">
          {campaign.name}
        </h1>
        {campaign.description && (
          <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-4">
            {campaign.description}
          </p>
        )}
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">Total members:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">
              {totalMembers}
            </span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">Called:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">
              {calledCount} / {totalMembers}
            </span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">Assigned:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">
              {assignedCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterDistrict}
          onChange={e => setFilterDistrict(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">อำเภอ (ทั้งหมด)</option>
          {districts.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">ระดับ (ทั้งหมด)</option>
          {tiers.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">สถานะ (ทั้งหมด)</option>
          <option value="unassigned">รอมอบหมาย</option>
          <option value="assigned">มอบหมายแล้ว</option>
          <option value="called">โทรแล้ว</option>
        </select>

        <select
          value={filterAssignee}
          onChange={e => setFilterAssignee(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">ผู้รับผิดชอบ (ทั้งหมด)</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-lg overflow-hidden">

        {/* Header */}
        <div className="
          grid items-center px-3 py-2.5
          bg-warm-100 dark:bg-warm-dark-200
          border-b border-warm-200 dark:border-warm-dark-300
          text-xs font-medium text-warm-500 dark:text-warm-dark-500
          [grid-template-columns:32px_1fr_32px_80px]
          md:[grid-template-columns:32px_1fr_36px_88px_100px_88px_32px]
        ">
          <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll}
            className="w-4 h-4 accent-teal cursor-pointer" />
          <span>
            {selectedMembers.size > 0
              ? `เลือก ${selectedMembers.size} / ${filteredMembers.length}`
              : `ชื่อ (${filteredMembers.length})`}
          </span>
          <span className="text-center">ระดับ</span>
          <span className="md:hidden">สถานะ</span>
          <span className="hidden md:block">อำเภอ</span>
          <span className="hidden md:block">มอบหมายให้</span>
          <span className="hidden md:block">สถานะ</span>
          <span className="hidden md:block text-right">โทร</span>
        </div>

        {/* Rows */}
        {filteredMembers.length === 0 ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-warm-dark-400 text-sm">
            ไม่พบสมาชิก
          </div>
        ) : (
          <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
            {visibleMembers.map(member => {
              const tier = member.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const status = member.member_status || 'unassigned'
              const statusBadge = getStatusBadge(status)

              return (
                <div
                  key={member.source_id}
                  className="
                    grid items-center px-3 py-3
                    hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition-colors
                    [grid-template-columns:32px_1fr_32px_80px]
                    md:[grid-template-columns:32px_1fr_36px_88px_100px_88px_32px]
                  "
                >
                  <input
                    type="checkbox"
                    checked={selectedMembers.has(member.source_id)}
                    onChange={() => handleSelectMember(member.source_id)}
                    className="w-4 h-4 accent-teal cursor-pointer"
                  />
                  {/* Name — 2 lines: name / district · assigned */}
                  <div className="min-w-0 pr-2">
                    <div className="truncate text-sm font-medium text-warm-900 dark:text-warm-50">
                      {member.full_name}
                    </div>
                    <div className="truncate text-xs text-warm-400 dark:text-warm-dark-400">
                      {member.home_amphure || ''}{member.assigned_to ? ` · ${usersMap[member.assigned_to] || member.assigned_to}` : ''}
                    </div>
                  </div>
                  {/* Tier — always visible */}
                  <div className="flex justify-center">
                    <div className="px-1.5 py-0.5 rounded text-xs font-semibold text-center"
                      style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>
                      {tier}
                    </div>
                  </div>
                  {/* Mobile: status only */}
                  <div className="md:hidden">
                    <div className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                      style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}>
                      {statusBadge.label}
                    </div>
                  </div>
                  {/* Desktop extras */}
                  <div className="hidden md:block text-xs text-warm-500 dark:text-warm-dark-500 truncate pr-2">
                    {member.home_amphure || '—'}
                  </div>
                  <div className="hidden md:block text-xs text-warm-400 dark:text-warm-dark-400 truncate pr-2"
                    title={usersMap[member.assigned_to] || member.assigned_to || '—'}>
                    {usersMap[member.assigned_to] || member.assigned_to || '—'}
                  </div>
                  <div className="hidden md:block">
                    <div className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                      style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}>
                      {statusBadge.label}
                    </div>
                  </div>
                  <div className="hidden md:block text-xs text-warm-500 dark:text-warm-dark-500 text-right">
                    {member.total_calls || 0}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Sentinel / Footer */}
        <div ref={sentinelRef}
          className="px-6 py-3 text-center text-xs text-warm-400 dark:text-warm-dark-400 border-t border-warm-200 dark:border-warm-dark-300">
          {hasMore ? 'Loading more...' : filteredMembers.length > 0 ? `แสดงครบ ${filteredMembers.length} คน` : ''}
        </div>
      </div>

      {/* Assign To / Unassign buttons — bottom toolbar */}
      {selectedMembers.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-full shadow-lg px-5 py-2.5 z-40">
          <span className="text-sm font-medium text-warm-900 dark:text-warm-50">
            เลือก {selectedMembers.size} คน
          </span>
          <button
            onClick={() => setSplitModalOpen(true)}
            className="px-4 py-1.5 bg-teal hover:opacity-90 text-white text-sm font-medium rounded-full transition"
          >
            มอบหมาย ↗
          </button>
          <button
            onClick={handleUnassign}
            className="px-4 py-1.5 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 text-sm font-medium rounded-full hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition"
          >
            ยกเลิกมอบหมาย
          </button>
        </div>
      )}

      {/* Assign Modal */}
      <SplitModal
        isOpen={splitModalOpen}
        unassignedCount={selectedMembers.size > 0 ? selectedMembers.size : unassignedCount}
        onClose={() => setSplitModalOpen(false)}
        onConfirm={handleSplit}
      />
    </div>
  )
}
