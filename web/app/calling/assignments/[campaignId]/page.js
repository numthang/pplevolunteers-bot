'use client'

import { useEffect, useState, useRef, useCallback, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import SplitModal from '@/components/calling/SplitModal.jsx'
import SmsModal from '@/components/calling/SmsModal.jsx'
import RecordCallModal from '@/components/calling/RecordCallModal.jsx'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'
import { PhoneCall, PhoneOff, Clock, Minus, Users, MessageSquare, AlertTriangle, Timer, UserMinus, Infinity } from 'lucide-react'

const STATUS_ICONS = {
  pending:       { Icon: Clock,         color: '#ff9800' },
  called:        { Icon: PhoneCall,     color: '#0d9e94' },
  answered:      { Icon: PhoneCall,     color: '#0d9e94' },
  no_answer:     { Icon: PhoneOff,      color: '#854f0b' },
  not_called:    { Icon: Minus,         color: '#9ca3af' },
  met:           { Icon: Users,         color: '#1a5e2d' },
  sms_sent:      { Icon: MessageSquare, color: '#4338ca' },
  sms_delivered: { Icon: MessageSquare, color: '#1d4ed8' },
  sms_failed:    { Icon: AlertTriangle, color: '#a32d2d' },
}
import { buildSmsTemplate } from '@/lib/buildSmsTemplate.js'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/../config/callingCategories.js'

const EDIT_STATUS_OPTIONS = [
  { value: 'answered',   label: 'รับสาย' },
  { value: 'no_answer',  label: 'ไม่รับ' },
  { value: 'not_called', label: 'ไม่โทร' },
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


function getStatusBadge(status) {
  if (status === 'assigned') return { bg: '#e0e7ff', text: '#4f46e5', label: 'มอบหมายแล้ว' }
  return { bg: '#faeeda', text: '#854f0b', label: 'รอมอบหมาย' }
}

function getExpiryIcon(expiredAt) {
  if (!expiredAt) return null
  const now = Date.now()
  const exp = new Date(expiredAt).getTime()
  if (exp < now) return { Icon: AlertTriangle, color: '#ef4444', title: 'หมดอายุ' }
  if (exp - now < 90 * 24 * 60 * 60 * 1000) return { Icon: Timer, color: '#d97706', title: 'ใกล้หมดอายุ' }
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
const FILTER_CLS_ACTIVE = 'h-11 px-3 text-base border border-teal bg-teal/10 text-teal dark:text-teal font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full sm:w-auto'
const filterCls = (val) => val ? FILTER_CLS_ACTIVE : FILTER_CLS

export default function CampaignPage({ params }) {
  const { campaignId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') === 'contact' ? 'contact' : 'member')

  const [campaign, setCampaign] = useState(null)
  const [tabTotals, setTabTotals] = useState({ member: null, contact: null })
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
  const [filterSms, setFilterSms] = useState(() => searchParams.get('sms') || '')
  const { data: session } = useSession()
  const { discordId: effectiveDiscordId, access } = useEffectiveRoles(session)
  const isModerator = can('deleteLog', access?.permissions || [])
  const canSendBulkSms = can('sendBulkSms', access?.permissions || [])

  const [splitModalOpen, setSplitModalOpen] = useState(false)
  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [recordModalMember, setRecordModalMember] = useState(null)


  // id ของแต่ละ row ตาม tab
  const getItemId = useCallback((item) => activeTab === 'contact' ? item.id : item.source_id, [activeTab])

  const openRecordModal = useCallback((item) => {
    setRecordModalMember({
      ...item,
      campaign_id: parseInt(campaignId),
      campaign_name: campaign?.name,
      campaign_description: campaign?.description,
      event_date: campaign?.event_date,
    })
  }, [campaignId, campaign])

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
    if (filterSms)      p.set('sms', filterSms)
    const qs = p.toString()
    router.replace(qs ? `/calling/assignments/${campaignId}?${qs}` : `/calling/assignments/${campaignId}`, { scroll: false })
  }, [debouncedName, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, filterExpiry, filterCalled, filterSort, filterStatus, filterSms, activeTab])

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)

  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  const buildMembersUrl = (offset, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called, sort, status, sms) => {
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
    if (sms)      p.set('sms', sms)
    return `/api/calling/members?${p}`
  }

  const buildContactsUrl = (offset, amphure, tier, assignee, name, called, status, sms) => {
    const p = new URLSearchParams({ campaignId, limit: PAGE_SIZE, offset })
    if (amphure)  p.set('amphoe', amphure)
    if (tier)     p.set('tier', tier)
    if (assignee) p.set('assignedTo', assignee)
    if (name)     p.set('name', name)
    if (called)   p.set('called', called)
    if (status)   p.set('status', status)
    if (sms)      p.set('sms', sms)
    return `/api/calling/contacts/campaign?${p}`
  }

  const loadFirst = useCallback(async (tab, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called, sort, status, sms) => {
    setLoadingInitial(true)
    setHasMore(false)
    hasMoreRef.current = false
    offsetRef.current = 0
    try {
      const dataUrl = tab === 'contact'
        ? buildContactsUrl(0, amphure, tier, assignee, name, called, status, sms)
        : buildMembersUrl(0, amphure, subdistricts, tier, assignee, rsvp, name, expiry, called, sort, status, sms)
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
        ? buildContactsUrl(offsetRef.current, filterAmphure, filterTier, filterAssignee, debouncedName, filterCalled, filterStatus, filterSms)
        : buildMembersUrl(offsetRef.current, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms)
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
  }, [activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms])

  const handleRecordSave = useCallback(async (payload) => {
    await fetch('/api/calling/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setRecordModalMember(null)
    await loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms)
  }, [activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms, loadFirst])

  useEffect(() => {
    ;(async () => {
      const [campaignRes, usersRes, memberStatsRes, contactStatsRes] = await Promise.all([
        fetch(`/api/calling/campaigns/${campaignId}`),
        fetch('/api/calling/users?all=true'),
        fetch(`/api/calling/members?campaignId=${campaignId}&stats=true`),
        fetch(`/api/calling/contacts/campaign?campaignId=${campaignId}&stats=true`),
      ])
      const cData = await campaignRes.json()
      if (cData.data) setCampaign(cData.data)
      const uData = await usersRes.json()
      if (uData.data) {
        const map = {}
        for (const u of uData.data) map[u.discord_id] = u.display_name
        setUsersMap(map)
      }
      const mStats = await memberStatsRes.json()
      const cStats = await contactStatsRes.json()
      setTabTotals({
        member: mStats.data?.total ?? null,
        contact: cStats.data?.total ?? null,
      })
    })()
  }, [campaignId])

  useEffect(() => {
    loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms)
  }, [campaignId, activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms])

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
      await loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms)
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
      await loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms)
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
    setFilterSms('')
    setSelectedMembers(new Set())
    setExpandedId(null)
  }

  const hasActiveFilters = !!(filterName || filterAmphure || filterSubdistricts.size > 0 || filterTier || filterAssignee || filterRsvp || filterExpiry || filterCalled || filterSort || filterStatus || filterSms)

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
    setFilterSms('')
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
        <img
          src={campaign.image_url || 'https://act.pplethai.org/wp-content/uploads/2024/09/pple-cover-yt.jpg'}
          alt={campaign.name}
          className="w-full h-40 object-cover rounded-lg mb-3"
        />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">
            {campaign?.name} <span className="text-warm-500 dark:text-disc-muted font-normal text-base">(assignor)</span>
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
        {['member', 'contact'].map(tab => {
          const total = tabTotals[tab]
          return (
            <button key={tab} onClick={() => switchTab(tab)}
              className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-teal text-teal'
                  : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              {tab === 'member' ? 'Member' : 'Contact'}
              {total !== null && (
                <span className={`text-sm px-1.5 py-0.5 rounded-full font-normal ${
                  activeTab === tab
                    ? 'bg-teal/10 text-teal'
                    : 'bg-warm-100 dark:bg-disc-header text-warm-500 dark:text-disc-muted'
                }`}>{total}</span>
              )}
            </button>
          )
        })}
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
        <select value={filterAmphure} onChange={e => setFilterAmphure(e.target.value)} className={filterCls(filterAmphure)}>
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

        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={filterCls(filterTier)}>
          <option value="">Tier</option>
          {['A','B','C','D'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className={filterCls(filterAssignee)}>
          <option value="">ผู้รับผิดชอบ</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.count})</option>
          ))}
        </select>

        <select value={filterCalled} onChange={e => setFilterCalled(e.target.value)} className={filterCls(filterCalled)}>
          <option value="">สถานะ</option>
          <option value="called">โทรแล้ว</option>
          <option value="uncalled">รอโทร</option>
        </select>

        <select value={filterSms} onChange={e => setFilterSms(e.target.value)} className={filterCls(filterSms)}>
          <option value="">SMS</option>
          <option value="sms_sent">ส่ง SMS แล้ว</option>
          <option value="no_sms">ยังไม่ส่ง SMS</option>
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
          <select value={filterRsvp} onChange={e => setFilterRsvp(e.target.value)} className={filterCls(filterRsvp)}>
            <option value="">RSVP</option>
            <option value="yes">✓ เข้าร่วม</option>
            <option value="no">✗ ไม่เข้าร่วม</option>
            <option value="maybe">? อาจจะ</option>
          </select>

          <select value={filterExpiry} onChange={e => setFilterExpiry(e.target.value)} className={filterCls(filterExpiry)}>
            <option value="">สมาชิกภาพ</option>
            <option value="lifetime">ตลอดชีพ</option>
            <option value="expiring">ใกล้หมดอายุ (90 วัน)</option>
            <option value="expired">หมดอายุแล้ว</option>
          </select>

          <select value={filterSort} onChange={e => setFilterSort(e.target.value)} className={filterCls(filterSort)}>
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
        <div className={`
          grid items-center px-3 py-2.5
          bg-warm-100 dark:bg-disc-header
          border-b border-warm-200 dark:border-disc-border
          text-base font-medium text-warm-500 dark:text-disc-muted
          [grid-template-columns:40px_1fr_44px]
          md:[grid-template-columns:40px_40px_1fr_120px_88px_80px]
        `}>
          <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll}
            className="w-6 h-6 accent-teal cursor-pointer" />
          <span className="hidden md:block">#</span>
          <span>
            {selectedMembers.size > 0
              ? `เลือก ${selectedMembers.size} / ${members.length}`
              : `ชื่อ (${loadingInitial ? '...' : members.length})`}
          </span>
          <span className="md:hidden text-center">โทร</span>
          <span className="hidden md:block">มอบหมาย</span>
          <span className="hidden md:block">{activeTab === 'contact' ? 'ประเภท' : 'ตำบล'}</span>
          <span className="hidden md:block text-center">โทร</span>
        </div>

        {/* Rows */}
        {loadingInitial ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
        ) : noAccess ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base text-warm-700 dark:text-disc-text font-medium mb-1">ยังไม่ได้รับสิทธิ์เข้าถึงส่วนนี้</p>
            <p className="text-base text-warm-400 dark:text-disc-muted">ต้องการเข้าใช้งาน? ติดต่อฝ่ายเครือข่ายได้เลยนะครับ</p>
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
              // member-specific
              const isMember  = activeTab === 'member'
              const hasPhone  = contactsHidden || !!(isMember ? item.mobile_number : item.phone)
              const dimmed    = !hasPhone ? 'opacity-50' : ''
              const expiryIcon = isMember ? getExpiryIcon(item.expired_at) : null
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
                    md:[grid-template-columns:40px_40px_1fr_120px_88px_80px]
                  `}>
                    <input type="checkbox"
                      checked={selectedMembers.has(itemId)}
                      onChange={() => handleSelectMember(itemId)}
                      className="w-6 h-6 accent-teal cursor-pointer" />
                    <span className={`hidden md:block text-sm tabular-nums text-warm-400 dark:text-disc-muted ${dimmed}`}>{idx + 1}</span>
                    <div className={`min-w-0 pr-2 cursor-pointer ${dimmed}`} onClick={() => openRecordModal(item)}>
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-base font-medium text-warm-900 dark:text-disc-text">
                          {displayName}
                        </span>
                        <span className="shrink-0 px-1 py-px rounded text-xs font-bold"
                          style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                        {item.flag && (
                          <span className="shrink-0 text-sm leading-none" title={item.flag === 'green' ? 'ตอบรับดี' : item.flag === 'yellow' ? 'ระวัง' : 'อย่าโทร'}>
                            {item.flag === 'green' ? '🟢' : item.flag === 'yellow' ? '🟡' : '🔴'}
                          </span>
                        )}
                        {isMember && (item.membership_type === 'ตลอดชีพ' || item.membership_type === 'สมาชิกตลอดชีพ') && (
                          <Infinity title="สมาชิกตลอดชีพ" className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                        )}
                        {expiryIcon && <expiryIcon.Icon title={expiryIcon.title} style={{ color: expiryIcon.color }} className="w-4 h-4 shrink-0 inline-block" />}
                        {catColor && <span className="md:hidden shrink-0 text-sm px-1.5 py-0.5 rounded font-medium" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
                        {!hasPhone && <span className="shrink-0 text-base text-warm-400 dark:text-disc-muted font-normal">ไม่มีเบอร์</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-base text-warm-500 dark:text-disc-text truncate">
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
                        <div className="text-base text-warm-600 dark:text-disc-text mt-0.5 truncate italic">
                          "{item.last_note}"
                        </div>
                      )}
                    </div>
                    <div className={`md:hidden flex justify-center items-center pl-2 ${dimmed}`}>
                      {item.total_calls > 0
                        ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.called.color }}><PhoneCall className="w-4 h-4" /><span className="text-sm font-medium">โทรแล้ว</span></span>
                        : item.assigned_to
                          ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.pending.color }}><Clock className="w-4 h-4" /><span className="text-sm font-medium">รอโทร</span></span>
                          : <span className="text-warm-300 dark:text-disc-muted text-sm">—</span>}
                    </div>
                    <div className={`hidden md:block text-base truncate pr-2 ${dimmed}`}>
                      {item.assigned_to
                        ? <a href={`https://discord.com/users/${item.assigned_to}`} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{usersMap[item.assigned_to] || item.assigned_to}</a>
                        : <span className="inline-flex items-center gap-1" style={{ color: badge.text }}><UserMinus className="w-4 h-4" /><span className="text-sm font-medium">{badge.label}</span></span>}
                    </div>
                    <div className={`hidden md:block truncate pr-2 ${dimmed}`}>
                      {activeTab === 'contact'
                        ? (catColor
                            ? <span className="text-sm px-1 py-px rounded font-medium" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>
                            : <span className="text-warm-400 dark:text-disc-muted text-sm">—</span>)
                        : <span className="text-base text-warm-500 dark:text-disc-muted">{tambon || '—'}</span>}
                    </div>
                    <div className={`hidden md:block text-center ${dimmed}`}>
                      {item.total_calls > 0
                        ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.called.color }}><PhoneCall className="w-4 h-4" /><span className="text-sm font-medium">โทรแล้ว</span></span>
                        : item.assigned_to
                          ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.pending.color }}><Clock className="w-4 h-4" /><span className="text-sm font-medium">รอโทร</span></span>
                          : <span className="text-warm-300 dark:text-disc-muted text-sm">—</span>}
                    </div>
                  </div>

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
          {canSendBulkSms && (
            <button onClick={() => setSmsModalOpen(true)}
              className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
              SMS ({selectedMembers.size})
            </button>
          )}
          <button onClick={() => setSelectedMembers(new Set())}
            className="px-3 py-2 text-warm-600 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text text-xl w-10 h-10 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-disc-hover transition">×</button>
        </div>
      )}

      <RecordCallModal
        isOpen={!!recordModalMember}
        member={recordModalMember}
        contact_type={activeTab === 'contact' ? 'contact' : 'member'}
        source="assignments"
        hasNext={false}
        onClose={() => setRecordModalMember(null)}
        onSave={handleRecordSave}
      />

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
        defaultMessage={buildSmsTemplate(campaign?.name, campaign?.event_date, campaignId)}
        onClose={() => setSmsModalOpen(false)}
        onDone={() => {
          setSmsModalOpen(false)
          setSelectedMembers(new Set())
          loadFirst(activeTab, filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName, filterExpiry, filterCalled, filterSort, filterStatus, filterSms)
        }}
      />

    </div>
  )
}
