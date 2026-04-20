'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import SplitModal from '@/components/calling/SplitModal.jsx'

const PAGE_SIZE = 100

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

function getStatusBadge(status) {
  if (status === 'assigned') return { bg: '#e0e7ff', text: '#4f46e5', label: 'มอบหมายแล้ว' }
  return { bg: '#faeeda', text: '#854f0b', label: 'รอมอบหมาย' }
}

export default function CampaignPage({ params }) {
  const { campaignId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [campaign, setCampaign] = useState(null)
  const [stats, setStats] = useState({ total: 0, called: 0, assigned: 0, unassigned: 0, districts: [], districtCounts: {}, tierCounts: {}, assigneeCounts: [] })
  const [members, setMembers] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [usersMap, setUsersMap] = useState({})

  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [filterName, setFilterName] = useState(() => searchParams.get('name') || '')
  const [debouncedName, setDebouncedName] = useState(() => searchParams.get('name') || '')
  const [filterDistrict, setFilterDistrict] = useState(() => searchParams.get('district') || '')
  const [filterTier, setFilterTier] = useState(() => searchParams.get('tier') || '')
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || '')
  const [filterAssignee, setFilterAssignee] = useState(() => searchParams.get('assignee') || '')
  const [filterRsvp, setFilterRsvp] = useState(() => searchParams.get('rsvp') || '')
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [logsCache, setLogsCache] = useState({})

  const LOG_STATUS_LABEL = { answered: 'รับสาย', no_answer: 'ไม่รับ', busy: 'สายไม่ว่าง', wrong_number: 'เบอร์ผิด' }
  const LOG_STATUS_COLOR = { answered: '#0d9e94', no_answer: '#a32d2d', busy: '#854f0b', wrong_number: '#6b7280' }

  const handleExpand = async (memberId) => {
    const next = expandedId === memberId ? null : memberId
    setExpandedId(next)
    if (next && !logsCache[next]) {
      const res = await fetch(`/api/calling/logs?campaignId=${campaignId}&memberId=${next}`)
      const data = await res.json()
      setLogsCache(prev => ({ ...prev, [next]: data.data || [] }))
    }
  }

  // Debounce name input 400ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(filterName), 400)
    return () => clearTimeout(t)
  }, [filterName])

  // Sync filters → URL
  useEffect(() => {
    const p = new URLSearchParams()
    if (debouncedName)  p.set('name', debouncedName)
    if (filterDistrict) p.set('district', filterDistrict)
    if (filterTier)     p.set('tier', filterTier)
    if (filterStatus)   p.set('status', filterStatus)
    if (filterAssignee) p.set('assignee', filterAssignee)
    if (filterRsvp)     p.set('rsvp', filterRsvp)
    const qs = p.toString()
    router.replace(qs ? `/calling/${campaignId}?${qs}` : `/calling/${campaignId}`, { scroll: false })
  }, [debouncedName, filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp])

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)

  // Keep refs in sync for use inside IntersectionObserver closure
  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  const buildMembersUrl = (offset, district, tier, status, assignee, rsvp, name) => {
    const limit = district ? 9999 : PAGE_SIZE
    const p = new URLSearchParams({ campaignId, limit, offset })
    if (district) p.set('amphure', district)
    if (tier)     p.set('tier', tier)
    if (status)   p.set('status', status)
    if (assignee) p.set('assignedTo', assignee)
    if (rsvp)     p.set('rsvp', rsvp)
    if (name)     p.set('name', name)
    return `/api/calling/members?${p}`
  }

  const fetchStats = useCallback(async () => {
    const res = await fetch(`/api/calling/members?campaignId=${campaignId}&stats=true`)
    const data = await res.json()
    if (data.data) setStats(data.data)
  }, [campaignId])

  // Load first page; reset member list
  const loadFirst = useCallback(async (district, tier, status, assignee, rsvp, name) => {
    setLoadingInitial(true)
    setHasMore(false)         // disconnect observer before resetting offset
    hasMoreRef.current = false
    offsetRef.current = 0
    try {
      const [memberRes, statsRes] = await Promise.all([
        fetch(buildMembersUrl(0, district, tier, status, assignee, rsvp, name)),
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
        offsetRef.current, filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp, debouncedName
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
  }, [filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp, debouncedName])

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
    loadFirst(filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp, debouncedName)
  }, [campaignId, filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp, debouncedName])

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
      for (let i = 0; i < assigneeIds.length; i++) {
        const chunk = targets.slice(i * perPerson, (i + 1) * perPerson)
        if (chunk.length === 0) continue
        const res = await fetch('/api/calling/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: parseInt(campaignId),
            member_ids: chunk,
            assigned_to: assigneeIds[i]
          })
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(`${res.status}: ${err.error} ${JSON.stringify(err.details || '')}`)
        }
      }
      setSplitModalOpen(false)
      await loadFirst(filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp, debouncedName)
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
      await loadFirst(filterDistrict, filterTier, filterStatus, filterAssignee, filterRsvp, debouncedName)
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
    return <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-sm">กำลังโหลด...</div>
  }

  if (!loadingInitial && !campaign) {
    return <div className="py-20 text-center text-red-500">ไม่พบแคมเปญ</div>
  }

  return (
    <div>

      {/* Campaign Header */}
      <div className="bg-white dark:bg-disc-bg2 border border-warm-200 dark:border-disc-border rounded-lg p-6 mb-8">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-disc-text mb-2">{campaign?.name}</h1>
        {campaign?.description && (
          <p className="text-sm text-warm-500 dark:text-disc-muted mb-4">{campaign.description}</p>
        )}
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <span className="text-warm-500 dark:text-disc-muted">สมาชิกทั้งหมด:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-disc-text">{stats.total}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-disc-muted">โทรแล้ว:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-disc-text">{stats.called} / {stats.total}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-disc-muted">มอบหมายแล้ว:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-disc-text">{stats.assigned}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-disc-muted">รอมอบหมาย:</span>
            <span className="ml-2 font-semibold text-warm-900 dark:text-disc-text">{stats.unassigned}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          value={filterName}
          onChange={e => setFilterName(e.target.value)}
          placeholder="ค้นหาชื่อ..."
          className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-40"
        />
        <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none">
          <option value="">อำเภอ</option>
          {stats.districts.map(d => (
            <option key={d} value={d}>{d || '(ไม่ระบุ)'} ({stats.districtCounts[d] || 0})</option>
          ))}
        </select>

        <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none">
          <option value="">ระดับ</option>
          {['A','B','C','D'].map(t => (
            <option key={t} value={t}>{t} ({stats.tierCounts[t] || 0})</option>
          ))}
        </select>

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none">
          <option value="">สถานะ</option>
          <option value="unassigned">รอมอบหมาย ({stats.unassigned})</option>
          <option value="assigned">มอบหมายแล้ว ({stats.assigned})</option>
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none">
          <option value="">ผู้รับผิดชอบ</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.count})</option>
          ))}
        </select>

        <select value={filterRsvp} onChange={e => setFilterRsvp(e.target.value)}
          className="h-9 px-3 text-sm border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal flex-1 sm:flex-none">
          <option value="">RSVP</option>
          <option value="yes">✓ เข้าร่วม</option>
          <option value="no">✗ ไม่เข้าร่วม</option>
          <option value="maybe">? อาจจะ</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-disc-bg2 border border-warm-200 dark:border-disc-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="
          grid items-center px-3 py-2.5
          bg-warm-100 dark:bg-disc-header
          border-b border-warm-200 dark:border-disc-border
          text-xs font-medium text-warm-500 dark:text-disc-muted
          [grid-template-columns:40px_1fr_36px]
          md:[grid-template-columns:40px_40px_1fr_36px_120px_88px_32px]
        ">
          <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll}
            className="w-6 h-6 accent-teal cursor-pointer" />
          <span className="hidden md:block">#</span>
          <span>
            {selectedMembers.size > 0
              ? `เลือก ${selectedMembers.size} / ${members.length}`
              : `ชื่อ (${loadingInitial ? '...' : members.length})`}
          </span>
          <span className="text-center">ระดับ</span>
          <span className="hidden md:block">มอบหมาย</span>
          <span className="hidden md:block">อำเภอ</span>
          <span className="hidden md:block text-right">โทร</span>
        </div>

        {/* Rows */}
        {loadingInitial ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-sm">กำลังโหลด...</div>
        ) : members.length === 0 ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-sm">ไม่พบสมาชิก</div>
        ) : (
          <div>
            {members.map((member, idx) => {
              const tier = member.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const status = member.member_status || 'unassigned'
              const badge = getStatusBadge(status)
              const hasPhone = !!member.mobile_number
              const isExpanded = expandedId === member.source_id
              const dimmed = !hasPhone ? 'opacity-50' : ''
              const memberLogs = logsCache[member.source_id]
              return (
                <div key={member.source_id} className="border-b border-warm-200 dark:border-disc-border last:border-0">
                  {/* Main row */}
                  <div className={`
                    grid items-center px-3 py-3
                    hover:bg-warm-50 dark:hover:bg-disc-hover transition-colors
                    [grid-template-columns:40px_1fr_36px]
                    md:[grid-template-columns:40px_40px_1fr_36px_120px_88px_32px]
                    ${isExpanded ? 'bg-warm-50 dark:bg-disc-hover' : ''}
                  `}>
                    <input type="checkbox"
                      checked={selectedMembers.has(member.source_id)}
                      onChange={() => handleSelectMember(member.source_id)}
                      className="w-6 h-6 accent-teal cursor-pointer" />
                    <span className={`hidden md:block text-xs tabular-nums text-warm-400 dark:text-disc-muted ${dimmed}`}>{idx + 1}</span>
                    <div className={`min-w-0 pr-2 cursor-pointer ${dimmed}`} onClick={() => handleExpand(member.source_id)}>
                      <div className="truncate text-base font-medium text-warm-900 dark:text-disc-text">
                        {member.full_name}
                        {!hasPhone && <span className="ml-2 text-xs text-warm-400 dark:text-disc-muted font-normal">ไม่มีเบอร์</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-warm-400 dark:text-disc-muted truncate">
                        <span
                          className="shrink-0 w-1.5 h-1.5 rounded-full inline-block"
                          style={{ backgroundColor: badge.text }}
                        />
                        <span className="truncate">
                          {member.home_amphure || ''}{member.assigned_to ? ` · ${usersMap[member.assigned_to] || member.assigned_to}` : ''}
                        </span>
                        {member.rsvp && (
                          <span className="shrink-0 font-bold" style={{ color: RSVP_ICONS[member.rsvp]?.color || '#666' }}>
                            {RSVP_ICONS[member.rsvp]?.icon}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`flex justify-center ${dimmed}`}>
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                    </div>
                    <div className={`hidden md:block text-sm truncate pr-2 ${dimmed}`}>
                      {member.assigned_to
                        ? <span className="text-warm-900 dark:text-disc-text">{usersMap[member.assigned_to] || member.assigned_to}</span>
                        : <span className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>}
                    </div>
                    <div className={`hidden md:block text-sm text-warm-500 dark:text-disc-muted truncate pr-2 ${dimmed}`}>
                      {member.home_amphure || '—'}
                    </div>
                    <div className={`hidden md:block text-sm text-warm-500 dark:text-disc-muted text-right ${dimmed}`}>
                      {member.total_calls || 0}
                    </div>
                  </div>

                  {/* Expanded info panel */}
                  {isExpanded && (
                    <div className="px-4 py-2 bg-warm-50 dark:bg-disc-hover border-t border-warm-200 dark:border-disc-border">
                      {/* Info strip */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
                        <span>
                          {member.mobile_number
                            ? <a href={`tel:${member.mobile_number}`} className="text-teal font-medium">{member.mobile_number}</a>
                            : <span className="text-warm-400 dark:text-disc-muted">ไม่มีเบอร์</span>}
                        </span>
                        {member.line_id && <span className="text-warm-500 dark:text-disc-muted">LINE: {member.line_id}</span>}
                        {member.assigned_to && <span className="text-warm-500 dark:text-disc-muted">มอบหมาย: {usersMap[member.assigned_to] || member.assigned_to}</span>}
                      </div>
                      {/* Call history */}
                      {memberLogs === undefined ? (
                        <div className="text-sm text-warm-400 dark:text-disc-muted py-1">กำลังโหลด...</div>
                      ) : memberLogs.length === 0 ? (
                        <div className="text-sm text-warm-400 dark:text-disc-muted py-1">ยังไม่มีประวัติการโทร</div>
                      ) : (
                        <div className="space-y-0.5">
                          {memberLogs.map(log => (
                            <div key={log.id} className="flex items-baseline gap-3 text-sm py-0.5">
                              <span className="text-warm-400 dark:text-disc-muted tabular-nums shrink-0">
                                {new Date(log.called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                              </span>
                              <span className="shrink-0 font-medium" style={{ color: LOG_STATUS_COLOR[log.status] }}>
                                {LOG_STATUS_LABEL[log.status] || log.status}
                              </span>
                              <span className="text-warm-500 dark:text-disc-muted shrink-0">{log.caller_name || '—'}</span>
                              {log.note && <span className="text-warm-400 dark:text-disc-muted truncate">"{log.note}"</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Scroll sentinel */}
        <div ref={sentinelRef}
          className="px-6 py-3 text-center text-xs text-warm-400 dark:text-disc-muted border-t border-warm-200 dark:border-disc-border">
          {loadingMore
            ? 'กำลังโหลดเพิ่มเติม...'
            : !loadingInitial && members.length > 0
              ? hasMore ? '' : `แสดงครบ ${members.length} คน`
              : ''}
        </div>
      </div>

      {/* Floating toolbar */}
      {selectedMembers.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto flex items-center gap-3 bg-white dark:bg-disc-bg2 border border-warm-200 dark:border-disc-border rounded-2xl sm:rounded-full shadow-lg px-5 py-2.5 z-40">
          <span className="text-sm font-medium text-warm-900 dark:text-disc-text shrink-0">เลือก {selectedMembers.size} คน</span>
          <button onClick={() => setSplitModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-1.5 bg-teal hover:opacity-90 text-white text-sm font-medium rounded-full transition text-center">
            มอบหมาย ↗
          </button>
          <button onClick={handleUnassign}
            className="flex-1 sm:flex-none px-4 py-1.5 bg-white dark:bg-disc-bg2 border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text text-sm font-medium rounded-full hover:bg-warm-50 dark:hover:bg-disc-hover transition text-center">
            ยกเลิก
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
