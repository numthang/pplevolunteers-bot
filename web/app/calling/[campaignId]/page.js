'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import SplitModal from '@/components/calling/SplitModal.jsx'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'

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

function getExpiryBadge(expiredAt) {
  if (!expiredAt) return null
  const now = Date.now()
  const exp = new Date(expiredAt).getTime()
  if (exp < now) return { label: 'หมดอายุ', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' }
  if (exp - now < 90 * 24 * 60 * 60 * 1000) return { label: 'ใกล้หมด', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' }
  return null
}

const URL_RE = /https?:\/\/[^\s]+/g

function parseLinks(text) {
  const parts = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline break-all">{m[0]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function ExpandableDescription({ text }) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) {
      setClamped(
        ref.current.scrollHeight > ref.current.clientHeight ||
        ref.current.scrollWidth > ref.current.clientWidth
      )
    }
  }, [text])
  return (
    <div className="flex items-baseline gap-1 mt-1">
      <p ref={ref} className={`text-base text-warm-400 dark:text-disc-muted ${expanded ? '' : 'line-clamp-1'}`}>
        {parseLinks(text)}
      </p>
      {(clamped || expanded) && (
        <button onClick={() => setExpanded(!expanded)} className="text-base text-teal hover:underline shrink-0">
          {expanded ? 'ย่อ' : 'ดูเพิ่ม'}
        </button>
      )}
    </div>
  )
}

const FILTER_CLS = 'h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full sm:w-auto'

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
  const [noAccess, setNoAccess] = useState(false)
  const [usersMap, setUsersMap] = useState({})

  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [filterName, setFilterName] = useState(() => searchParams.get('name') || '')
  const [debouncedName, setDebouncedName] = useState(() => searchParams.get('name') || '')
  const [filterAmphure, setFilterAmphure] = useState(() => searchParams.get('amphure') || '')
  const [filterSubdistricts, setFilterSubdistricts] = useState(() => {
    const s = searchParams.get('subdistricts')
    return s ? new Set(s.split(',')) : new Set()
  })
  const [availableSubdistricts, setAvailableSubdistricts] = useState([])
  const [loadingSubdistricts, setLoadingSubdistricts] = useState(false)
  const [subdistrictsOpen, setSubdistrictsOpen] = useState(false)
  const subdistrictsRef = useRef(null)
  const [filterTier, setFilterTier] = useState(() => searchParams.get('tier') || '')
  const [filterAssignee, setFilterAssignee] = useState(() => searchParams.get('assignee') || '')
  const [filterRsvp, setFilterRsvp] = useState(() => searchParams.get('rsvp') || '')
  const [filterExpiry, setFilterExpiry] = useState(() => searchParams.get('expiry') || '')
  const [filterCalled, setFilterCalled] = useState(() => searchParams.get('called') || '')
  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [logsCache, setLogsCache] = useState({})

  const LOG_STATUS_LABEL = { answered: 'รับสาย', no_answer: 'ไม่รับ', busy: 'สายไม่ว่าง', wrong_number: 'เบอร์ผิด' }
  const LOG_STATUS_COLOR = { answered: '#0d9e94', no_answer: '#a32d2d', busy: '#854f0b', wrong_number: '#6b7280' }

  const handleExpand = async (memberId) => {
    const next = expandedId === memberId ? null : memberId
    setExpandedId(next)
    if (next && !logsCache[next]) {
      const res = await fetch(`/api/calling/logs?memberId=${next}`)
      const data = await res.json()
      setLogsCache(prev => ({ ...prev, [next]: data.data || [] }))
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(filterName), 400)
    return () => clearTimeout(t)
  }, [filterName])

  useEffect(() => {
    function handleClickOutside(event) {
      if (subdistrictsRef.current && !subdistrictsRef.current.contains(event.target)) {
        setSubdistrictsOpen(false)
      }
    }
    if (subdistrictsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [subdistrictsOpen])

  useEffect(() => {
    if (!filterAmphure) {
      setAvailableSubdistricts([])
      setFilterSubdistricts(new Set())
      return
    }
    setLoadingSubdistricts(true)
    fetch(`/api/calling/districts?campaignId=${campaignId}&amphure=${encodeURIComponent(filterAmphure)}`)
      .then(r => r.json())
      .then(data => {
        setAvailableSubdistricts(data.data || [])
        setFilterSubdistricts(new Set())
      })
      .catch(err => console.error('Error fetching subdistricts:', err))
      .finally(() => setLoadingSubdistricts(false))
  }, [campaignId, filterAmphure])

  useEffect(() => {
    const p = new URLSearchParams()
    if (debouncedName)  p.set('name', debouncedName)
    if (filterAmphure)  p.set('amphure', filterAmphure)
    if (filterSubdistricts.size > 0) p.set('subdistricts', Array.from(filterSubdistricts).join(','))
    if (filterTier)     p.set('tier', filterTier)
    if (filterAssignee) p.set('assignee', filterAssignee)
    if (filterRsvp)     p.set('rsvp', filterRsvp)
    if (filterExpiry)   p.set('expiry', filterExpiry)
    if (filterCalled)   p.set('called', filterCalled)
    const qs = p.toString()
    router.replace(qs ? `/calling/${campaignId}?${qs}` : `/calling/${campaignId}`, { scroll: false })
  }, [debouncedName, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, filterExpiry, filterCalled])

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)

  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  const buildMembersUrl = (offset, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called) => {
    const limit = amphure ? 9999 : PAGE_SIZE
    const p = new URLSearchParams({ campaignId, limit, offset })
    if (amphure) p.set('amphure', amphure)
    if (subdistricts && subdistricts.size > 0) p.set('subdistricts', Array.from(subdistricts).join(','))
    if (tier)     p.set('tier', tier)
    if (assignee) p.set('assignedTo', assignee)
    if (rsvp)     p.set('rsvp', rsvp)
    if (name)     p.set('name', name)
    if (expiry)   p.set('expiry', expiry)
    if (called)   p.set('called', called)
    return `/api/calling/members?${p}`
  }

  const loadFirst = useCallback(async (amphure, subdistricts, tier, assignee, rsvp, name, expiry, called) => {
    setLoadingInitial(true)
    setHasMore(false)
    hasMoreRef.current = false
    offsetRef.current = 0
    try {
      const [memberRes, statsRes] = await Promise.all([
        fetch(buildMembersUrl(0, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called)),
        fetch(`/api/calling/members?campaignId=${campaignId}&stats=true`)
      ])
      const memberData = await memberRes.json()
      if (memberData.noAccess) { setNoAccess(true); return }
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

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    setLoadingMore(true)
    loadingMoreRef.current = true
    try {
      const res = await fetch(buildMembersUrl(
        offsetRef.current, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled
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
  }, [filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled])

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

  useEffect(() => {
    loadFirst(filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled)
  }, [campaignId, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '0px 0px 300px 0px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

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

  const handleSplit = async (assigneeIds) => {
    try {
      let targets
      if (selectedMembers.size > 0) {
        targets = members.filter(m => selectedMembers.has(m.source_id)).map(m => m.source_id)
      } else {
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
          body: JSON.stringify({ campaign_id: parseInt(campaignId), member_ids: chunk, assigned_to: assigneeIds[i] })
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(`${res.status}: ${err.error} ${JSON.stringify(err.details || '')}`)
        }
      }
      setSplitModalOpen(false)
      await loadFirst(filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

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
      await loadFirst(filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const hasActiveFilters = !!(filterName || filterAmphure || filterSubdistricts.size > 0 || filterTier || filterAssignee || filterRsvp || filterExpiry || filterCalled)

  const clearFilters = () => {
    setFilterName('')
    setDebouncedName('')
    setFilterAmphure('')
    setFilterSubdistricts(new Set())
    setFilterTier('')
    setFilterAssignee('')
    setFilterRsvp('')
    setFilterExpiry('')
    setFilterCalled('')
  }

  const assignees = (stats.assigneeCounts || [])
    .map(a => ({ id: a.id, name: usersMap[a.id] || a.id, count: a.count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const isAllSelected = members.length > 0 && selectedMembers.size === members.length

  if (loadingInitial && !campaign) {
    return <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
  }
  if (!loadingInitial && !campaign) {
    return <div className="py-20 text-center text-red-500 text-base">ไม่พบแคมเปญ</div>
  }

  return (
    <div>

      {/* Campaign Header */}
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border border-l-4 border-l-violet-500 dark:border-l-violet-400 rounded-lg px-4 py-3 mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-lg font-semibold text-warm-900 dark:text-disc-text">{campaign?.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-base text-warm-500 dark:text-disc-muted">
            <span>สมาชิก <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.total}</span></span>
            <span>โทรแล้ว <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.called}/{stats.total}</span></span>
            <span>มอบหมาย <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.assigned}</span></span>
            <span>รอ <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.unassigned}</span></span>
          </div>
        </div>
        {campaign?.description && (
          <ExpandableDescription text={campaign.description} />
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={filterName}
          onChange={e => setFilterName(e.target.value)}
          placeholder="ค้นหาชื่อ..."
          className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full sm:w-40"
        />
        <select value={filterAmphure} onChange={e => setFilterAmphure(e.target.value)} className={FILTER_CLS}>
          <option value="">อำเภอ</option>
          {stats.districts.map(d => (
            <option key={d} value={d}>{d || '(ไม่ระบุ)'} ({stats.districtCounts[d] || 0})</option>
          ))}
        </select>

        {filterAmphure && (
          <div ref={subdistrictsRef} className="relative">
            {loadingSubdistricts ? (
              <div className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg flex items-center">
                กำลังโหลด...
              </div>
            ) : availableSubdistricts.length === 0 ? (
              <div className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-bg2 text-warm-400 dark:text-disc-muted rounded-lg flex items-center">
                ไม่มีตำบล
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSubdistrictsOpen(!subdistrictsOpen)}
                  className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full text-left flex justify-between items-center"
                >
                  ตำบล {filterSubdistricts.size > 0 && <span>({filterSubdistricts.size})</span>}
                </button>
                {subdistrictsOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg z-20 w-56 max-h-60 overflow-y-auto">
                    {availableSubdistricts.map(sub => (
                      <label key={sub.name} className="flex items-center px-3 py-2.5 text-base text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filterSubdistricts.has(sub.name)}
                          onChange={e => {
                            const s = new Set(filterSubdistricts)
                            e.target.checked ? s.add(sub.name) : s.delete(sub.name)
                            setFilterSubdistricts(s)
                          }}
                          className="accent-teal"
                        />
                        <span className="ml-2">{sub.name || '(ไม่ระบุ)'} ({sub.count})</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={FILTER_CLS}>
          <option value="">Tier</option>
          {['A','B','C','D'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className={FILTER_CLS}>
          <option value="">ผู้รับผิดชอบ</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.count})</option>
          ))}
        </select>

        <select value={filterCalled} onChange={e => setFilterCalled(e.target.value)} className={FILTER_CLS}>
          <option value="">สถานะ</option>
          <option value="called">โทรแล้ว</option>
          <option value="uncalled">รอโทร</option>
        </select>

        <select value={filterRsvp} onChange={e => setFilterRsvp(e.target.value)} className={FILTER_CLS}>
          <option value="">RSVP</option>
          <option value="yes">✓ เข้าร่วม</option>
          <option value="no">✗ ไม่เข้าร่วม</option>
          <option value="maybe">? อาจจะ</option>
        </select>

        <select value={filterExpiry} onChange={e => setFilterExpiry(e.target.value)} className={FILTER_CLS}>
          <option value="">สมาชิกภาพ</option>
          <option value="expiring">ใกล้หมดอายุ (90 วัน)</option>
          <option value="expired">หมดอายุแล้ว</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 rounded-lg transition-colors whitespace-nowrap"
          >
            ล้าง filter ×
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="
          grid items-center px-3 py-2.5
          bg-warm-100 dark:bg-disc-header
          border-b border-warm-200 dark:border-disc-border
          text-base font-medium text-warm-500 dark:text-disc-muted
          [grid-template-columns:40px_1fr_44px]
          md:[grid-template-columns:40px_40px_1fr_44px_120px_88px_80px]
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
          <span className="hidden md:block">ตำบล</span>
          <span className="hidden md:block text-center">โทร</span>
        </div>

        {/* Rows */}
        {loadingInitial ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
        ) : noAccess ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base text-warm-700 dark:text-warm-100 font-medium mb-1">ยังไม่ได้รับสิทธิ์เข้าถึงส่วนนี้</p>
            <p className="text-base text-warm-400 dark:text-warm-dark-500">ต้องการเข้าใช้งาน? ติดต่อฝ่ายเครือข่ายได้เลยนะครับ</p>
          </div>
        ) : members.length === 0 ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-base">ไม่พบสมาชิก</div>
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
              const expiryBadge = getExpiryBadge(member.expired_at)
              const memberLogs = logsCache[member.source_id]
              return (
                <div key={member.source_id} className="border-b border-warm-200 dark:border-disc-border last:border-0">
                  {/* Main row */}
                  <div className={`
                    grid items-center px-3 py-3
                    hover:bg-warm-50 dark:hover:bg-disc-hover transition-colors
                    [grid-template-columns:40px_1fr_44px]
                    md:[grid-template-columns:40px_40px_1fr_44px_120px_88px_80px]
                    ${isExpanded ? 'bg-warm-50 dark:bg-disc-hover' : ''}
                  `}>
                    <input type="checkbox"
                      checked={selectedMembers.has(member.source_id)}
                      onChange={() => handleSelectMember(member.source_id)}
                      className="w-6 h-6 accent-teal cursor-pointer" />
                    <span className={`hidden md:block text-sm tabular-nums text-warm-400 dark:text-disc-muted ${dimmed}`}>{idx + 1}</span>
                    <div className={`min-w-0 pr-2 cursor-pointer ${dimmed}`} onClick={() => handleExpand(member.source_id)}>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-base font-medium text-warm-900 dark:text-disc-text">
                          {member.full_name}
                        </span>
                        {expiryBadge && <span className={`shrink-0 text-base font-medium px-1.5 py-0.5 rounded ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                        {!hasPhone && <span className="shrink-0 text-base text-warm-400 dark:text-disc-muted font-normal">ไม่มีเบอร์</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-base text-warm-500 dark:text-warm-200 truncate">
                        <span
                          className="shrink-0 w-1.5 h-1.5 rounded-full inline-block"
                          style={{ backgroundColor: badge.text }}
                        />
                        <span className="truncate">
                          {[
                            member.home_district || null,
                            member.home_amphure  || null,
                            member.assigned_to   ? usersMap[member.assigned_to] || member.assigned_to : null,
                          ].filter(Boolean).join(' · ')}
                        </span>
                        {member.rsvp && (
                          <span className="shrink-0 font-bold" style={{ color: RSVP_ICONS[member.rsvp]?.color || '#666' }}>
                            {RSVP_ICONS[member.rsvp]?.icon}
                          </span>
                        )}
                      </div>
                      {member.last_note && (
                        <div className="text-base text-warm-600 dark:text-warm-200 mt-0.5 truncate italic">
                          "{member.last_note}"
                        </div>
                      )}
                    </div>
                    <div className={`flex justify-center ${dimmed}`}>
                      <span className="px-1.5 py-0.5 rounded text-base font-semibold"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                    </div>
                    <div className={`hidden md:block text-base truncate pr-2 ${dimmed}`}>
                      {member.assigned_to
                        ? <a href={`https://discord.com/users/${member.assigned_to}`} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{usersMap[member.assigned_to] || member.assigned_to}</a>
                        : <span className="px-2 py-0.5 rounded text-base font-medium whitespace-nowrap" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>}
                    </div>
                    <div className={`hidden md:block text-base text-warm-500 dark:text-disc-muted truncate pr-2 ${dimmed}`}>
                      {member.home_district || '—'}
                    </div>
                    <div className={`hidden md:block text-center ${dimmed}`}>
                      {(() => {
                        const c = member.total_calls > 0 ? CALL_STATUS_COLORS.called : CALL_STATUS_COLORS.pending
                        return <span className="px-2 py-0.5 rounded text-sm font-medium whitespace-nowrap" style={{ backgroundColor: c.bg, color: c.text }}>{c.label}</span>
                      })()}
                    </div>
                  </div>

                  {/* Expanded info panel */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-warm-50 dark:bg-disc-hover border-t border-warm-200 dark:border-disc-border">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-base mb-2">
                        <span>
                          {member.mobile_number
                            ? <a href={`tel:${member.mobile_number}`} className="text-teal font-medium">{member.mobile_number}</a>
                            : <span className="text-warm-400 dark:text-disc-muted">ไม่มีเบอร์</span>}
                        </span>
                        {member.line_id && <span className="text-warm-500 dark:text-disc-muted">LINE: {member.line_id}</span>}
                      </div>
                      {memberLogs === undefined ? (
                        <div className="text-base text-warm-400 dark:text-disc-muted py-1">กำลังโหลด...</div>
                      ) : memberLogs.length === 0 ? (
                        <div className="text-base text-warm-400 dark:text-disc-muted py-1">ยังไม่มีประวัติการโทร</div>
                      ) : (
                        <div className="space-y-1">
                          {memberLogs.map(log => {
                            const logColor = LOG_STATUS_COLOR[log.status] ? { bg: LOG_STATUS_COLOR[log.status], text: '#fff' } : { bg: '#f3f4f6', text: '#6b7280' }
                            return (
                              <div key={log.id} className="text-base py-0.5">
                                <div className="flex items-center gap-3">
                                  <span className="text-warm-400 dark:text-disc-muted tabular-nums shrink-0">
                                    {new Date(log.called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-base font-semibold shrink-0" style={{ backgroundColor: logColor.bg, color: logColor.text }}>
                                    {LOG_STATUS_LABEL[log.status] || log.status}
                                  </span>
                                  {log.caller_name && log.called_by ? (
                                    <a href={`https://discord.com/users/${log.called_by}`} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline shrink-0">
                                      {log.caller_name}
                                    </a>
                                  ) : (
                                    <span className="text-warm-600 dark:text-warm-200 shrink-0">{log.caller_name || '—'}</span>
                                  )}
                                </div>
                                {log.note && <div className="text-warm-700 dark:text-disc-text mt-0.5">"{log.note}"</div>}
                              </div>
                            )
                          })}
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
          className="px-6 py-3 text-center text-base text-warm-400 dark:text-disc-muted border-t border-warm-200 dark:border-disc-border">
          {loadingMore
            ? 'กำลังโหลดเพิ่มเติม...'
            : !loadingInitial && members.length > 0
              ? hasMore ? '' : `แสดงครบ ${members.length} คน`
              : ''}
        </div>
      </div>

      {/* Floating toolbar */}
      {selectedMembers.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto flex items-center gap-3 bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl sm:rounded-full shadow-lg px-5 py-3 z-40">
          <span className="text-base font-medium text-warm-900 dark:text-disc-text shrink-0">เลือก {selectedMembers.size} คน</span>
          <button onClick={() => setSplitModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-teal hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
            มอบหมาย ↗
          </button>
          <button onClick={handleUnassign}
            className="flex-1 sm:flex-none px-4 py-2 bg-card-bg border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text text-base font-medium rounded-full hover:bg-warm-50 dark:hover:bg-disc-hover transition text-center">
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
