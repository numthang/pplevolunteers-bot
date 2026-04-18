'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import Link from 'next/link'
import SplitModal from '@/components/calling/SplitModal.jsx'

const PAGE_SIZE = 100

const TIER_COLORS = {
  A: { bg: '#ead3ce', text: '#714b2b' },
  B: { bg: '#cce5f4', text: '#0c447c' },
  C: { bg: '#faeeda', text: '#854f0b' },
  D: { bg: '#fcebeb', text: '#a32d2d' },
}

function getStatusBadge(status) {
  if (status === 'assigned') return { bg: '#e0e7ff', text: '#4f46e5', label: 'มอบหมายแล้ว' }
  return { bg: '#faeeda', text: '#854f0b', label: 'รอมอบหมาย' }
}

export default function CampaignPage({ params }) {
  const { campaignId } = use(params)

  const [campaign, setCampaign] = useState(null)
  const [stats, setStats] = useState({ total: 0, called: 0, assigned: 0, unassigned: 0, districts: [], districtCounts: {}, tierCounts: {}, assigneeCounts: [] })
  const [members, setMembers] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [usersMap, setUsersMap] = useState({})

  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [splitModalOpen, setSplitModalOpen] = useState(false)

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)

  // Keep refs in sync for use inside IntersectionObserver closure
  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  const buildMembersUrl = (offset, district, tier, status, assignee) => {
    const p = new URLSearchParams({ campaignId, limit: PAGE_SIZE, offset })
    if (district) p.set('amphure', district)
    if (tier)     p.set('tier', tier)
    if (status)   p.set('status', status)
    if (assignee) p.set('assignedTo', assignee)
    return `/api/calling/members?${p}`
  }

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/calling/members?campaignId=${campaignId}&stats=true`)
    const data = await res.json()
    if (data.data) setStats(data.data)
  }, [campaignId])

  // Load first page; reset member list
  const loadFirst = useCallback(async (district, tier, status, assignee) => {
    setLoadingInitial(true)
    setHasMore(false)         // disconnect observer before resetting offset
    hasMoreRef.current = false
    offsetRef.current = 0
    try {
      const [memberRes, statsRes] = await Promise.all([
        fetch(buildMembersUrl(0, district, tier, status, assignee)),
        fetch(`/api/calling/members?campaignId=${campaignId}&stats=true`)
      ])
      const memberData = await memberRes.json()
      const newRows = memberData.data || []
      setMembers(newRows)
      setHasMore(memberData.hasMore || false)
      hasMoreRef.current = memberData.hasMore || false
      offsetRef.current = newRows.length
      setSelectedMembers(new Set())

      const statsData = await statsRes.json()
      if (statsData.data) setStats(statsData.data)
    } catch (err) {
      console.error('loadFirst', err)
    } finally {
      setLoadingInitial(false)
    }
  }, [campaignId])

  // Load next page; append
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    setLoadingMore(true)
    loadingMoreRef.current = true
    try {
      const res = await fetch(buildMembersUrl(
        offsetRef.current, filterDistrict, filterTier, filterStatus, filterAssignee
      ))
      const data = await res.json()
      const newRows = data.data || []
      setMembers(prev => [...prev, ...newRows])
      setHasMore(data.hasMore || false)
      hasMoreRef.current = data.hasMore || false
      offsetRef.current += newRows.length
    } catch (err) {
      console.error('loadMore', err)
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [filterDistrict, filterTier, filterStatus, filterAssignee])

  // Initial: fetch campaign + users (only once per campaignId)
  useEffect(() => {
    ;(async () => {
      const [campaignRes, usersRes] = await Promise.all([
        fetch('/api/calling/campaigns'),
        fetch('/api/calling/users?all=true')
      ])
      const cData = await campaignRes.json()
      const camp = cData.data?.find(c => c.id === parseInt(campaignId))
      if (camp) setCampaign(camp)

      const uData = await usersRes.json()
      if (uData.data) {
        const map = {}
        for (const u of uData.data) map[u.discord_id] = u.display_name
        setUsersMap(map)
      }
    })()
  }, [campaignId])

  // Re-fetch members when filters change (or on mount)
  useEffect(() => {
    loadFirst(filterDistrict, filterTier, filterStatus, filterAssignee)
  }, [campaignId, filterDistrict, filterTier, filterStatus, filterAssignee])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '0px 0px 300px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedMembers.size === members.length && members.length > 0) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(members.map(m => m.source_id)))
    }
  }

  const handleSelectMember = (id) => {
    const s = new Set(selectedMembers)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelectedMembers(s)
  }

  // Assign (split) handler
  const handleSplit = async (assigneeIds) => {
    try {
      let targets
      if (selectedMembers.size > 0) {
        targets = members.filter(m => selectedMembers.has(m.source_id)).map(m => m.source_id)
      } else {
        // Fetch all unassigned IDs from server (not limited to loaded page)
        const res = await fetch(`/api/calling/members?campaignId=${campaignId}&status=unassigned&limit=500&offset=0`)
        const data = await res.json()
        targets = (data.data || []).map(m => m.source_id)
      }

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
              member_ids: chunk,
              assigned_to: discordId
            })
          }).then(async res => {
            if (!res.ok) {
              const err = await res.json()
              throw new Error(`${res.status}: ${err.error} ${JSON.stringify(err.details || '')}`)
            }
          })
        })
      )
      setSplitModalOpen(false)
      await loadFirst(filterDistrict, filterTier, filterStatus, filterAssignee)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // Unassign handler
  const handleUnassign = async () => {
    const ids = Array.from(selectedMembers)
    if (!confirm(`ยกเลิกมอบหมาย ${ids.length} คน?`)) return
    try {
      await Promise.all(
        ids.map(memberId =>
          fetch('/api/calling/assignments', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: parseInt(campaignId), member_id: memberId })
          }).then(async res => {
            if (!res.ok) throw new Error((await res.json()).error)
          })
        )
      )
      await loadFirst(filterDistrict, filterTier, filterStatus, filterAssignee)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // Assignees from stats (all assigned members, not limited to loaded page)
  const assignees = (stats.assigneeCounts || [])
    .map(a => ({ id: a.id, name: usersMap[a.id] || a.id, count: a.count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const isAllSelected = members.length > 0 && selectedMembers.size === members.length

  if (loadingInitial && !campaign) {
    return <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-sm">กำลังโหลด...</div>
  }

  if (!loadingInitial && !campaign) {
    return <div className="py-20 text-center text-red-500">ไม่พบแคมเปญ</div>
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-warm-500 dark:text-warm-dark-500">
        <Link href="/calling" className="text-teal hover:underline">Campaigns</Link>
        <span className="mx-2">›</span>
        <span className="text-warm-900 dark:text-warm-50">{campaign?.name}</span>
      </div>

      {/* Campaign Header */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-lg p-6 mb-8">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-warm-50 mb-2">{campaign?.name}</h1>
        {campaign?.description && (
          <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-4">{campaign.description}</p>
        )}
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">สมาชิกทั้งหมด:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">{stats.total}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">โทรแล้ว:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">{stats.called} / {stats.total}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">มอบหมายแล้ว:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">{stats.assigned}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-warm-dark-500">รอมอบหมาย:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-warm-50">{stats.unassigned}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal">
          <option value="">อำเภอ (ทั้งหมด)</option>
          {stats.districts.map(d => (
            <option key={d} value={d}>{d || '(ไม่ระบุ)'} ({stats.districtCounts[d] || 0})</option>
          ))}
        </select>

        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal">
          <option value="">ระดับ (ทั้งหมด)</option>
          {['A','B','C','D'].map(t => (
            <option key={t} value={t}>{t} ({stats.tierCounts[t] || 0})</option>
          ))}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal">
          <option value="">สถานะ (ทั้งหมด)</option>
          <option value="unassigned">รอมอบหมาย ({stats.unassigned})</option>
          <option value="assigned">มอบหมายแล้ว ({stats.assigned})</option>
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal">
          <option value="">ผู้รับผิดชอบ (ทั้งหมด)</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.count})</option>
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
              ? `เลือก ${selectedMembers.size} / ${members.length}`
              : `ชื่อ (${loadingInitial ? '...' : members.length})`}
          </span>
          <span className="text-center">ระดับ</span>
          <span className="md:hidden">สถานะ</span>
          <span className="hidden md:block">อำเภอ</span>
          <span className="hidden md:block">มอบหมายให้</span>
          <span className="hidden md:block">สถานะ</span>
          <span className="hidden md:block text-right">โทร</span>
        </div>

        {/* Rows */}
        {loadingInitial ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-warm-dark-400 text-sm">กำลังโหลด...</div>
        ) : members.length === 0 ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-warm-dark-400 text-sm">ไม่พบสมาชิก</div>
        ) : (
          <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
            {members.map(member => {
              const tier = member.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const status = member.member_status || 'unassigned'
              const badge = getStatusBadge(status)
              return (
                <div key={member.source_id}
                  className="
                    grid items-center px-3 py-3
                    hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition-colors
                    [grid-template-columns:32px_1fr_32px_80px]
                    md:[grid-template-columns:32px_1fr_36px_88px_100px_88px_32px]
                  ">
                  <input type="checkbox"
                    checked={selectedMembers.has(member.source_id)}
                    onChange={() => handleSelectMember(member.source_id)}
                    className="w-4 h-4 accent-teal cursor-pointer" />
                  <div className="min-w-0 pr-2">
                    <div className="truncate text-sm font-medium text-warm-900 dark:text-warm-50">{member.full_name}</div>
                    <div className="truncate text-xs text-warm-400 dark:text-warm-dark-400">
                      {member.home_amphure || ''}{member.assigned_to ? ` · ${usersMap[member.assigned_to] || member.assigned_to}` : ''}
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                  </div>
                  <div className="md:hidden">
                    <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                      style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
                  </div>
                  <div className="hidden md:block text-xs text-warm-500 dark:text-warm-dark-500 truncate pr-2">
                    {member.home_amphure || '—'}
                  </div>
                  <div className="hidden md:block text-xs text-warm-400 dark:text-warm-dark-400 truncate pr-2"
                    title={usersMap[member.assigned_to] || member.assigned_to || '—'}>
                    {usersMap[member.assigned_to] || member.assigned_to || '—'}
                  </div>
                  <div className="hidden md:block">
                    <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                      style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>
                  </div>
                  <div className="hidden md:block text-xs text-warm-500 dark:text-warm-dark-500 text-right">
                    {member.total_calls || 0}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Scroll sentinel */}
        <div ref={sentinelRef}
          className="px-6 py-3 text-center text-xs text-warm-400 dark:text-warm-dark-400 border-t border-warm-200 dark:border-warm-dark-300">
          {loadingMore
            ? 'กำลังโหลดเพิ่มเติม...'
            : !loadingInitial && members.length > 0
              ? hasMore ? '' : `แสดงครบ ${members.length} คน`
              : ''}
        </div>
      </div>

      {/* Floating toolbar */}
      {selectedMembers.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-full shadow-lg px-5 py-2.5 z-40">
          <span className="text-sm font-medium text-warm-900 dark:text-warm-50">เลือก {selectedMembers.size} คน</span>
          <button onClick={() => setSplitModalOpen(true)}
            className="px-4 py-1.5 bg-teal hover:opacity-90 text-white text-sm font-medium rounded-full transition">
            มอบหมาย ↗
          </button>
          <button onClick={handleUnassign}
            className="px-4 py-1.5 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 text-sm font-medium rounded-full hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition">
            ยกเลิกมอบหมาย
          </button>
        </div>
      )}

      <SplitModal
        isOpen={splitModalOpen}
        unassignedCount={selectedMembers.size > 0 ? selectedMembers.size : stats.unassigned}
        onClose={() => setSplitModalOpen(false)}
        onConfirm={handleSplit}
      />
    </div>
  )
}
