'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import SplitModal from '@/components/calling/SplitModal.jsx'
import SmsModal from '@/components/calling/SmsModal.jsx'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'

const MODERATOR_ROLES = ['Admin', 'เลขาธิการ', 'Moderator']
const EDIT_STATUS_OPTIONS = [
  { value: 'answered',   label: 'รับสาย' },
  { value: 'no_answer',  label: 'ไม่รับ' },
  { value: 'not_called', label: 'ไม่ได้โทร' },
]
const URL_RE_PAGE = /https?:\/\/[^\s]+/g
function parseLinksPage(text) {
  const parts = []; let last = 0
  for (const m of text.matchAll(URL_RE_PAGE)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline break-all">{m[0]}</a>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

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

const CATEGORY_LABELS = {
  donor: 'ผู้บริจาค', prospect: 'คนสนใจ', volunteer: 'อาสาสมัคร', other: 'อื่นๆ',
}
const CATEGORY_COLORS = {
  donor:     { bg: '#cce5f4', text: '#0c447c' },
  prospect:  { bg: '#ead3ce', text: '#714b2b' },
  volunteer: { bg: '#d4edda', text: '#1a5e2d' },
  other:     { bg: '#f3f4f6', text: '#374151' },
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
      <p ref={ref} className={`text-base text-warm-500 dark:text-disc-text ${expanded ? '' : 'line-clamp-1'}`}>
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

  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') === 'contact' ? 'contact' : 'member')

  const [campaign, setCampaign] = useState(null)
  const [stats, setStats] = useState({ total: 0, called: 0, assigned: 0, unassigned: 0, districts: [], districtCounts: {}, tierCounts: {}, assigneeCounts: [] })
  const [members, setMembers] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingInitial, setLoadingInitial] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [noAccess, setNoAccess] = useState(false)
  const [contactsHidden, setContactsHidden] = useState(false)
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
  const [filterSort, setFilterSort] = useState(() => searchParams.get('sort') || '')
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || '')
  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)
  const isModerator = MODERATOR_ROLES.some(r => effectiveRoles.includes(r))

  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [logsCache, setLogsCache] = useState({})
  const [editingLogId, setEditingLogId] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNote, setEditNote] = useState('')


  const reloadLogs = useCallback(async (itemId) => {
    const contactType = activeTab === 'contact' ? '&contactType=contact' : ''
    const res = await fetch(`/api/calling/logs?memberId=${itemId}${contactType}`)
    const data = await res.json()
    setLogsCache(prev => ({ ...prev, [itemId]: data.data || [] }))
  }, [activeTab])

  // id ของแต่ละ row ตาม tab
  const getItemId = useCallback((item) => activeTab === 'contact' ? item.id : item.source_id, [activeTab])

  const handleExpand = async (itemId) => {
    const next = expandedId === itemId ? null : itemId
    setExpandedId(next)
    if (next && !logsCache[next]) {
      const contactType = activeTab === 'contact' ? '&contactType=contact' : ''
      const res = await fetch(`/api/calling/logs?memberId=${next}${contactType}`)
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

  // subdistricts only for member tab (data from ngs_member_cache)
  useEffect(() => {
    if (activeTab !== 'member' || !filterAmphure) {
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
  }, [campaignId, filterAmphure, activeTab])

  useEffect(() => {
    const p = new URLSearchParams()
    if (activeTab === 'contact') p.set('tab', 'contact')
    if (debouncedName)  p.set('name', debouncedName)
    if (filterAmphure)  p.set('amphure', filterAmphure)
    if (activeTab === 'member') {
      if (filterSubdistricts.size > 0) p.set('subdistricts', Array.from(filterSubdistricts).join(','))
      if (filterRsvp)   p.set('rsvp', filterRsvp)
      if (filterExpiry) p.set('expiry', filterExpiry)
      if (filterSort)   p.set('sort', filterSort)
    }
    if (filterTier)     p.set('tier', filterTier)
    if (filterAssignee) p.set('assignee', filterAssignee)
    if (filterCalled)   p.set('called', filterCalled)
    if (filterStatus)   p.set('status', filterStatus)
    const qs = p.toString()
    router.replace(qs ? `/calling/${campaignId}?${qs}` : `/calling/${campaignId}`, { scroll: false })
  }, [debouncedName, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, filterExpiry, filterCalled, filterSort, filterStatus, activeTab])

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)

  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  const buildMembersUrl = (offset, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called, sort, status) => {
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
    if (sort)     p.set('sort', sort)
    if (status)   p.set('status', status)
    return `/api/calling/members?${p}`
  }

  const buildContactsUrl = (offset, amphure, tier, assignee, name, called, status) => {
    const p = new URLSearchParams({ campaignId, limit: PAGE_SIZE, offset })
    if (amphure)  p.set('amphoe', amphure)
    if (tier)     p.set('tier', tier)
    if (assignee) p.set('assignedTo', assignee)
    if (name)     p.set('name', name)
    if (called)   p.set('called', called)
    if (status)   p.set('status', status)
    return `/api/calling/contacts/campaign?${p}`
  }

  const loadFirst = useCallback(async (tab, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called, sort, status) => {
    setLoadingInitial(true)
    setHasMore(false)
    hasMoreRef.current = false
    offsetRef.current = 0
    setExpandedId(null)
    setLogsCache({})
    try {
      const dataUrl = tab === 'contact'
        ? buildContactsUrl(0, amphure, tier, assignee, name, called, status)
        : buildMembersUrl(0, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called, sort, status)
      const statsUrl = tab === 'contact'
        ? `/api/calling/contacts/campaign?campaignId=${campaignId}&stats=true`
        : `/api/calling/members?campaignId=${campaignId}&stats=true`

      const [dataRes, statsRes] = await Promise.all([fetch(dataUrl), fetch(statsUrl)])
      const dataJson = await dataRes.json()
      if (dataJson.noAccess) { setNoAccess(true); return }
      setContactsHidden(dataJson.contacts_hidden || false)
      const newRows = dataJson.data || []
      setMembers(newRows)
      setHasMore(dataJson.hasMore || false)
      hasMoreRef.current = dataJson.hasMore || false
      offsetRef.current = newRows.length
      setSelectedMembers(new Set())
      const statsJson = await statsRes.json()
      if (statsJson.data) setStats(statsJson.data)
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
      const url = activeTab === 'contact'
        ? buildContactsUrl(offsetRef.current, filterAmphure, filterTier, filterAssignee, debouncedName, filterCalled, filterStatus)
        : buildMembersUrl(offsetRef.current, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus)
      const res = await fetch(url)
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
  }, [activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus])

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
    loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus)
  }, [campaignId, activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus])

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
      setSelectedMembers(new Set(members.map(m => getItemId(m))))
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
        targets = members.filter(m => selectedMembers.has(getItemId(m))).map(m => getItemId(m))
      } else {
        const url = activeTab === 'contact'
          ? `/api/calling/contacts/campaign?campaignId=${campaignId}&status=unassigned&limit=500&offset=0`
          : `/api/calling/members?campaignId=${campaignId}&status=unassigned&limit=500&offset=0`
        const res = await fetch(url)
        const data = await res.json()
        targets = (data.data || []).map(m => getItemId(m))
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
            assigned_to: assigneeIds[i],
            contact_type: activeTab === 'contact' ? 'contact' : 'member',
          })
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(`${res.status}: ${err.error} ${JSON.stringify(err.details || '')}`)
        }
      }
      setSplitModalOpen(false)
      await loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  const handleUnassign = async () => {
    const ids = Array.from(selectedMembers)
    if (!confirm(`ยกเลิกมอบหมาย ${ids.length} คน?`)) return
    try {
      await Promise.all(
        ids.map(itemId =>
          fetch('/api/calling/assignments', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              campaign_id: parseInt(campaignId),
              member_id: itemId,
              contact_type: activeTab === 'contact' ? 'contact' : 'member',
            })
          }).then(async res => {
            if (!res.ok) throw new Error((await res.json()).error)
          })
        )
      )
      await loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // switch tab — reset filters
  const switchTab = (tab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    setFilterName('')
    setDebouncedName('')
    setFilterAmphure('')
    setFilterSubdistricts(new Set())
    setFilterTier('')
    setFilterAssignee('')
    setFilterRsvp('')
    setFilterExpiry('')
    setFilterCalled('')
    setFilterSort('')
    setFilterStatus('')
    setSelectedMembers(new Set())
    setExpandedId(null)
  }

  const hasActiveFilters = !!(filterName || filterAmphure || filterSubdistricts.size > 0 || filterTier || filterAssignee || filterRsvp || filterExpiry || filterCalled || filterSort || filterStatus)

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
    setFilterSort('')
    setFilterStatus('')
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
          <h1 className="text-lg font-semibold text-warm-900 dark:text-disc-text">
            {campaign?.name} <span className="text-warm-500 dark:text-warm-dark-400 font-normal text-base">(assignor)</span>
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-base text-warm-500 dark:text-disc-muted">
            <span>{activeTab === 'contact' ? 'Contact' : 'Member'} <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.total}</span></span>
            <span>โทรแล้ว <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.called}/{stats.assigned}</span></span>
          </div>
        </div>
        {campaign?.description && (
          <ExpandableDescription text={campaign.description} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-warm-200 dark:border-disc-border">
        {['member', 'contact'].map(tab => (
          <button key={tab} onClick={() => switchTab(tab)}
            className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-teal text-teal'
                : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
            }`}>
            {tab === 'member' ? 'Member' : 'Contact'}
          </button>
        ))}
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

        {/* subdistricts — member tab only */}
        {activeTab === 'member' && filterAmphure && (
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

        <button
          onClick={() => setFilterStatus(filterStatus === 'unassigned' ? '' : 'unassigned')}
          className={`h-11 px-3 text-base border rounded-lg transition-colors whitespace-nowrap ${
            filterStatus === 'unassigned'
              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
              : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}
        >
          รอมอบหมาย
        </button>

        {/* member-only filters */}
        {activeTab === 'member' && <>
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

          <select value={filterSort} onChange={e => setFilterSort(e.target.value)} className={FILTER_CLS}>
            <option value="">เรียงตาม: ที่อยู่/ชื่อ</option>
            <option value="least_called">โทรน้อยสุด (ทุกแคมเปญ)</option>
            <option value="uncalled">ยังไม่โทร (แคมเปญนี้)</option>
            <option value="tier">Tier</option>
          </select>
        </>}

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
          <span className="md:hidden text-center">โทร</span>
          <span className="hidden md:block text-center">ระดับ</span>
          <span className="hidden md:block">มอบหมาย</span>
          <span className="hidden md:block">{activeTab === 'contact' ? 'ตำบล' : 'ตำบล'}</span>
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
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-base">
            {activeTab === 'contact' ? 'ไม่พบ contact' : 'ไม่พบสมาชิก'}
          </div>
        ) : (
          <div>
            {members.map((item, idx) => {
              const itemId  = getItemId(item)
              const tier    = item.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const status  = item.member_status || 'unassigned'
              const badge   = getStatusBadge(status)
              const isExpanded = expandedId === itemId
              const itemLogs   = logsCache[itemId]

              // member-specific
              const isMember  = activeTab === 'member'
              const hasPhone  = contactsHidden || !!(isMember ? item.mobile_number : item.phone)
              const dimmed    = !hasPhone ? 'opacity-50' : ''
              const expiryBadge = isMember ? getExpiryBadge(item.expired_at) : null
              const catColor  = !isMember && item.category ? (CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other) : null

              const displayName = isMember ? item.full_name : [item.first_name, item.last_name].filter(Boolean).join(' ')
              const amphoe  = isMember ? item.home_amphure  : item.amphoe
              const tambon  = isMember ? item.home_district : item.tambon
              const phone   = isMember ? item.mobile_number : item.phone
              const lineId  = item.line_id

              return (
                <div key={itemId ?? idx} className="border-b border-warm-200 dark:border-disc-border last:border-0">
                  {/* Main row */}
                  <div className={`
                    grid items-center px-3 py-3
                    hover:bg-warm-50 dark:hover:bg-disc-hover transition-colors
                    [grid-template-columns:40px_1fr_auto]
                    md:[grid-template-columns:40px_40px_1fr_44px_120px_88px_80px]
                    ${isExpanded ? 'bg-warm-50 dark:bg-disc-hover' : ''}
                  `}>
                    <input type="checkbox"
                      checked={selectedMembers.has(itemId)}
                      onChange={() => handleSelectMember(itemId)}
                      className="w-6 h-6 accent-teal cursor-pointer" />
                    <span className={`hidden md:block text-sm tabular-nums text-warm-400 dark:text-disc-muted ${dimmed}`}>{idx + 1}</span>
                    <div className={`min-w-0 pr-2 cursor-pointer ${dimmed}`} onClick={() => handleExpand(itemId)}>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="md:hidden shrink-0 px-1.5 py-0.5 rounded text-sm font-semibold"
                          style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                        <span className="truncate text-base font-medium text-warm-900 dark:text-disc-text">
                          {displayName}
                        </span>
                        {expiryBadge && <span className={`shrink-0 text-base font-medium px-1.5 py-0.5 rounded ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                        {catColor && <span className="shrink-0 text-sm px-1.5 py-0.5 rounded font-medium" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
                        {!hasPhone && <span className="shrink-0 text-base text-warm-400 dark:text-disc-muted font-normal">ไม่มีเบอร์</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-base text-warm-500 dark:text-warm-200 truncate">
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: badge.text }} />
                        <span className="truncate">
                          {[tambon, amphoe, item.assigned_to ? usersMap[item.assigned_to] || item.assigned_to : null]
                            .filter(Boolean).join(' · ')}
                        </span>
                        {isMember && item.rsvp && (
                          <span className="shrink-0 font-bold" style={{ color: RSVP_ICONS[item.rsvp]?.color || '#666' }}>
                            {RSVP_ICONS[item.rsvp]?.icon}
                          </span>
                        )}
                      </div>
                      {item.last_note && (
                        <div className="text-base text-warm-600 dark:text-warm-200 mt-0.5 truncate italic">
                          "{item.last_note}"
                        </div>
                      )}
                    </div>
                    <div className={`flex justify-center items-center pl-2 ${dimmed}`}>
                      <div className="md:hidden">
                        {item.total_calls > 0
                          ? <span className="px-1.5 py-0.5 rounded text-sm font-medium whitespace-nowrap" style={{ backgroundColor: CALL_STATUS_COLORS.called.bg, color: CALL_STATUS_COLORS.called.text }}>{CALL_STATUS_COLORS.called.label}</span>
                          : item.assigned_to
                            ? <span className="px-1.5 py-0.5 rounded text-sm font-medium whitespace-nowrap" style={{ backgroundColor: CALL_STATUS_COLORS.pending.bg, color: CALL_STATUS_COLORS.pending.text }}>{CALL_STATUS_COLORS.pending.label}</span>
                            : <span className="text-warm-300 dark:text-disc-muted text-sm">—</span>}
                      </div>
                      <span className="hidden md:inline-block px-1.5 py-0.5 rounded text-base font-semibold"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                    </div>
                    <div className={`hidden md:block text-base truncate pr-2 ${dimmed}`}>
                      {item.assigned_to
                        ? <a href={`https://discord.com/users/${item.assigned_to}`} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{usersMap[item.assigned_to] || item.assigned_to}</a>
                        : <span className="px-2 py-0.5 rounded text-base font-medium whitespace-nowrap" style={{ backgroundColor: badge.bg, color: badge.text }}>{badge.label}</span>}
                    </div>
                    <div className={`hidden md:block text-base text-warm-500 dark:text-disc-muted truncate pr-2 ${dimmed}`}>
                      {tambon || '—'}
                    </div>
                    <div className={`hidden md:block text-center ${dimmed}`}>
                      {item.total_calls > 0
                        ? <span className="px-2 py-0.5 rounded text-sm font-medium whitespace-nowrap" style={{ backgroundColor: CALL_STATUS_COLORS.called.bg, color: CALL_STATUS_COLORS.called.text }}>{CALL_STATUS_COLORS.called.label}</span>
                        : item.assigned_to
                          ? <span className="px-2 py-0.5 rounded text-sm font-medium whitespace-nowrap" style={{ backgroundColor: CALL_STATUS_COLORS.pending.bg, color: CALL_STATUS_COLORS.pending.text }}>{CALL_STATUS_COLORS.pending.label}</span>
                          : <span className="text-warm-300 dark:text-disc-muted text-sm">—</span>}
                    </div>
                  </div>

                  {/* Expanded info panel */}
                  {isExpanded && (
                    <div className="px-4 py-2 bg-warm-50 dark:bg-disc-hover border-t border-warm-200 dark:border-disc-border">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-base mb-1.5">
                        {!contactsHidden && (
                          <span>
                            {phone
                              ? <a href={`tel:${phone}`} className="text-teal font-medium">{phone}</a>
                              : <span className="text-warm-400 dark:text-disc-muted">ไม่มีเบอร์</span>}
                          </span>
                        )}
                        {lineId && <span className="text-warm-500 dark:text-disc-muted">LINE: {lineId}</span>}
                        {!isMember && item.email && <span className="text-warm-500 dark:text-disc-muted">{item.email}</span>}
                        {!isMember && item.note && <span className="text-warm-600 dark:text-disc-text italic">"{item.note}"</span>}
                      </div>
                      {itemLogs === undefined ? (
                        <div className="text-base text-warm-400 dark:text-disc-muted py-1">กำลังโหลด...</div>
                      ) : itemLogs.length === 0 ? (
                        <div className="text-base text-warm-400 dark:text-disc-muted py-1">ยังไม่มีประวัติการโทร</div>
                      ) : (
                        <div className="space-y-1">
                          {itemLogs.map(log => {
                            const logColor = CALL_STATUS_COLORS[log.status] || { bg: '#f3f4f6', text: '#6b7280', label: log.status }
                            const canEdit = log.called_by === effectiveDiscordId || isModerator
                            const isEditing = editingLogId === log.id
                            return (
                              <div key={log.id} className="py-0.5">
                                {!isEditing && (
                                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                                    <span className="px-2 py-0.5 rounded text-base font-semibold shrink-0" style={{ backgroundColor: logColor.bg, color: logColor.text }}>{logColor.label}</span>
                                    <span className="text-base text-warm-800 dark:text-warm-100 break-words">
                                      {log.note ? parseLinksPage(log.note) : null}
                                      <span className="italic text-warm-400 dark:text-disc-muted">
                                        {(log.note && (log.caller_name || log.called_at)) ? ' — ' : ''}
                                        {log.caller_name && <a href={`https://discord.com/users/${log.called_by}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{log.caller_name}</a>}
                                        {log.caller_name && log.called_at ? ' ' : ''}
                                        {log.called_at ? new Date(log.called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : null}
                                      </span>
                                    </span>
                                    {canEdit && (
                                      <button onClick={() => { setEditingLogId(log.id); setEditStatus(log.status); setEditNote(log.note || '') }}
                                        className="p-0.5 rounded text-warm-400 hover:text-teal transition shrink-0">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>
                                    )}
                                    {isModerator && (
                                      <button onClick={async () => {
                                        if (!confirm('ลบ log นี้?')) return
                                        await fetch(`/api/calling/logs?id=${log.id}`, { method: 'DELETE' })
                                        reloadLogs(itemId)
                                      }} className="p-0.5 rounded text-warm-400 hover:text-red-500 transition shrink-0">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                      </button>
                                    )}
                                  </div>
                                )}
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap gap-1.5">
                                      {EDIT_STATUS_OPTIONS.map(opt => (
                                        <button key={opt.value} type="button" onClick={() => setEditStatus(opt.value)}
                                          className="px-2.5 py-1 rounded text-base border transition"
                                          style={editStatus === opt.value
                                            ? { backgroundColor: CALL_STATUS_COLORS[opt.value]?.bg, color: CALL_STATUS_COLORS[opt.value]?.text, borderColor: CALL_STATUS_COLORS[opt.value]?.text }
                                            : {}}>
                                          {opt.label}
                                        </button>
                                      ))}
                                    </div>
                                    <textarea rows={2} value={editNote} onChange={e => setEditNote(e.target.value)}
                                      className="w-full border dark:border-disc-border rounded px-2 py-1.5 text-base bg-card-bg text-warm-900 dark:text-disc-text resize-none" />
                                    <div className="flex gap-2">
                                      <button onClick={async () => {
                                        await fetch('/api/calling/logs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ id: log.id, status: editStatus, note: editNote }) })
                                        setEditingLogId(null)
                                        reloadLogs(itemId)
                                      }} className="px-3 py-1 rounded text-base bg-teal text-white hover:bg-teal/90 transition">บันทึก</button>
                                      <button onClick={() => setEditingLogId(null)} className="px-3 py-1 rounded text-base text-warm-500 hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition">ยกเลิก</button>
                                    </div>
                                  </div>
                                ) : null}
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
              ? hasMore ? '' : `แสดงครบ ${members.length} ${activeTab === 'contact' ? 'contact' : 'คน'}`
              : ''}
        </div>
      </div>

      {/* Floating toolbar */}
      {selectedMembers.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto flex items-center gap-3 bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl sm:rounded-full shadow-lg px-5 py-3 z-40">
          <button onClick={() => setSplitModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-teal hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
            Assign ({selectedMembers.size})
          </button>
          <button onClick={handleUnassign}
            className="flex-1 sm:flex-none px-4 py-2 bg-red-500 hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
            Unassign ({selectedMembers.size})
          </button>
          <button onClick={() => setSmsModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
            SMS ({selectedMembers.size})
          </button>
          <button onClick={() => setSelectedMembers(new Set())}
            className="px-3 py-2 text-warm-600 dark:text-warm-300 hover:text-warm-900 dark:hover:text-warm-50 text-xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition">×</button>
        </div>
      )}

      <SplitModal
        isOpen={splitModalOpen}
        unassignedCount={selectedMembers.size > 0 ? selectedMembers.size : stats.unassigned}
        onClose={() => setSplitModalOpen(false)}
        onConfirm={handleSplit}
      />

      <SmsModal
        isOpen={smsModalOpen}
        count={selectedMembers.size}
        campaignId={parseInt(campaignId)}
        contactType={activeTab === 'contact' ? 'contact' : 'member'}
        memberIds={Array.from(selectedMembers)}
        onClose={() => setSmsModalOpen(false)}
        onDone={() => {
          setSmsModalOpen(false)
          setSelectedMembers(new Set())
          loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus)
        }}
      />

    </div>
  )
}
