'use client'

import { useEffect, useState, useRef, useCallback, useMemo, use } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { can } from '@/lib/permissions.js'
import SplitModal from '@/components/calling/SplitModal.jsx'
import SmsModal from '@/components/calling/SmsModal.jsx'
import RecordCallModal from '@/components/calling/RecordCallModal.jsx'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'
// eslint-disable-next-line no-shadow-restricted-names -- Infinity คือชื่อไอคอน lucide ไม่ได้ตั้งใจทับ global
import { PhoneCall, PhoneOff, Clock, Minus, Users, MessageSquare, AlertTriangle, Timer, UserMinus, Star, Infinity } from 'lucide-react'

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
import { getFlagOption, flagDotStyle } from '@/lib/callingFlags.js'

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


function getStatusBadge(status, t) {
  if (status === 'assigned') return { bg: '#e0e7ff', text: '#4f46e5', label: t('assignment.statusAssigned') }
  return { bg: '#faeeda', text: '#854f0b', label: t('assignment.statusUnassigned') }
}

function getExpiryIcon(expiredAt, t) {
  if (!expiredAt) return null
  const now = Date.now()
  const exp = new Date(expiredAt).getTime()
  if (exp < now) return { Icon: AlertTriangle, color: '#ef4444', title: t('assignment.expiredLabel') }
  if (exp - now < 90 * 24 * 60 * 60 * 1000) return { Icon: Timer, color: '#d97706', title: t('assignment.expiringLabel') }
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
  const t = useTranslations('calling')
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
          {expanded ? t('assignment.collapseLabel') : t('assignment.expandLabel')}
        </button>
      )}
    </div>
  )
}

const FILTER_CLS = 'h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full sm:w-auto'
const FILTER_CLS_ACTIVE = 'h-11 px-3 text-base border border-teal bg-teal/10 text-teal dark:text-teal font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full sm:w-auto'
const filterCls = (val) => val ? FILTER_CLS_ACTIVE : FILTER_CLS

export default function CampaignPage({ params }) {
  const t = useTranslations('calling')
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
  const [discordIdMap, setDiscordIdMap] = useState({})

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
  const [filterStarred, setFilterStarred] = useState(() => searchParams.get('starred') || '')
  const [filterSigLocation, setFilterSigLocation] = useState(() => searchParams.get('sigLocation') || '')
  const [filterSigAvailability, setFilterSigAvailability] = useState(() => searchParams.get('sigAvailability') || '')
  const [filterSigInterest, setFilterSigInterest] = useState(() => searchParams.get('sigInterest') || '')

  // ตัวกรองทั้งชุดเป็นก้อนเดียว — เดิมส่งเป็น argument เรียงตำแหน่ง 12 ตัวผ่าน 6 จุด
  // พอเพิ่มตัวกรองทีไรต้องไล่แก้ทุกจุดให้เรียงตรงกัน = ที่มาของบั๊กแบบสลับค่ากันเงียบๆ
  const filters = useMemo(() => ({
    amphure: filterAmphure,
    subdistricts: filterSubdistricts,
    tier: filterTier,
    assignee: filterAssignee,
    rsvp: filterRsvp,
    name: debouncedName,
    expiry: filterExpiry,
    called: filterCalled,
    sort: filterSort,
    status: filterStatus,
    sms: filterSms,
    starred: filterStarred,
    sigLocation: filterSigLocation,
    sigAvailability: filterSigAvailability,
    sigInterest: filterSigInterest,
  }), [filterAmphure, filterSubdistricts, filterTier, filterAssignee, filterRsvp, debouncedName,
       filterExpiry, filterCalled, filterSort, filterStatus, filterSms, filterStarred,
       filterSigLocation, filterSigAvailability, filterSigInterest])

  const { data: session } = useSession()
  const { userId: effectiveUserId, access } = useEffectiveRoles(session, { scope: 'org' })
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
      act_event_id: campaign?.act_event_id,
      campaign_name: campaign?.name,
      campaign_description: campaign?.description,
      event_date: campaign?.event_date,
    })
  }, [campaignId, campaign])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(filterName), 400)
    return () => clearTimeout(timer)
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

  // subdistricts only for member tab (data from cache_pple_member)
  useEffect(() => {
    if (activeTab !== 'member' || !filterAmphure) {
      setAvailableSubdistricts([])
      // ว่างอยู่แล้วอย่าสร้าง Set ใหม่ — reference ใหม่จะ retrigger loadFirst แล้วล้าง checkbox ที่เพิ่งเลือก
      setFilterSubdistricts(prev => prev.size === 0 ? prev : new Set())
      return
    }
    setLoadingSubdistricts(true)
    // เปลี่ยนอำเภอเร็วๆ = คำขอเก่ายังค้าง — ต้องทิ้งคำตอบเก่า ไม่งั้นรายการตำบลสลับกัน
    let cancelled = false
    const controller = new AbortController()
    fetch(`/api/calling/districts?campaignId=${campaignId}&amphure=${encodeURIComponent(filterAmphure)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setAvailableSubdistricts(data.data || [])
        setFilterSubdistricts(new Set())
      })
      .catch(err => {
        if (cancelled || err.name === 'AbortError') return
        console.error('Error fetching subdistricts:', err)
      })
      .finally(() => { if (!cancelled) setLoadingSubdistricts(false) })
    return () => { cancelled = true; controller.abort() }
  }, [campaignId, filterAmphure, activeTab])

  useEffect(() => {
    const p = new URLSearchParams()
    if (activeTab === 'contact') p.set('tab', 'contact')
    if (filters.name)     p.set('name', filters.name)
    if (filters.amphure)  p.set('amphure', filters.amphure)
    if (activeTab === 'member') {
      if (filters.subdistricts.size > 0) p.set('subdistricts', Array.from(filters.subdistricts).join(','))
      if (filters.rsvp)   p.set('rsvp', filters.rsvp)
      if (filters.expiry) p.set('expiry', filters.expiry)
      if (filters.sort)   p.set('sort', filters.sort)
    }
    if (filters.tier)     p.set('tier', filters.tier)
    if (filters.assignee) p.set('assignee', filters.assignee)
    if (filters.called)   p.set('called', filters.called)
    if (filters.status)   p.set('status', filters.status)
    if (filters.sms)      p.set('sms', filters.sms)
    if (filters.starred)  p.set('starred', filters.starred)
    if (filters.sigLocation)     p.set('sigLocation', filters.sigLocation)
    if (filters.sigAvailability) p.set('sigAvailability', filters.sigAvailability)
    if (filters.sigInterest)     p.set('sigInterest', filters.sigInterest)
    const qs = p.toString()
    router.replace(qs ? `/calling/assignments/${campaignId}?${qs}` : `/calling/assignments/${campaignId}`, { scroll: false })
  }, [filters, activeTab, campaignId, router])

  const offsetRef = useRef(0)
  const sentinelRef = useRef(null)
  const loadingMoreRef = useRef(false)
  const hasMoreRef = useRef(false)
  // กันคำตอบเก่ามาทับ: สลับ tab/เปลี่ยนฟิลเตอร์ระหว่างที่ query เก่ายังไม่กลับ
  // = query เก่ากลับมาทีหลังแล้ว setMembers ทับข้อมูล tab ใหม่ (เจอจริงบน /calling/assignments/70)
  // ทุกครั้งที่โหลดชุดใหม่จะบวกเลขรุ่น + abort ของเดิม — คำตอบที่รุ่นไม่ตรงถูกทิ้งทั้งหมด
  const loadSeqRef = useRef(0)
  const abortRef = useRef(null)

  useEffect(() => { loadingMoreRef.current = loadingMore }, [loadingMore])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  // ตัวกรองที่ใช้ได้ทั้ง 2 tab (สัญญาณมาจาก calling_logs ซึ่งมีทั้ง member และ contact)
  const appendSharedParams = (p, f) => {
    if (f.tier)     p.set('tier', f.tier)
    if (f.assignee) p.set('assignedTo', f.assignee)
    if (f.name)     p.set('name', f.name)
    if (f.called)   p.set('called', f.called)
    if (f.status)   p.set('status', f.status)
    if (f.sms)      p.set('sms', f.sms)
    if (f.starred)  p.set('starred', f.starred)
    if (f.sigLocation)     p.set('sigLocation', f.sigLocation)
    if (f.sigAvailability) p.set('sigAvailability', f.sigAvailability)
    if (f.sigInterest)     p.set('sigInterest', f.sigInterest)
  }

  const buildMembersUrl = (offset, f) => {
    const limit = f.amphure ? 9999 : PAGE_SIZE
    const p = new URLSearchParams({ campaignId, limit, offset })
    if (f.amphure) p.set('amphure', f.amphure)
    if (f.subdistricts && f.subdistricts.size > 0) p.set('subdistricts', Array.from(f.subdistricts).join(','))
    if (f.rsvp)   p.set('rsvp', f.rsvp)
    if (f.expiry) p.set('expiry', f.expiry)
    if (f.sort)   p.set('sort', f.sort)
    appendSharedParams(p, f)
    return `/api/calling/members?${p}`
  }

  const buildContactsUrl = (offset, f) => {
    const p = new URLSearchParams({ campaignId, limit: PAGE_SIZE, offset })
    if (f.amphure) p.set('amphoe', f.amphure)
    appendSharedParams(p, f)
    return `/api/calling/contacts/campaign?${p}`
  }

  const loadFirst = useCallback(async (tab, f) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const seq = ++loadSeqRef.current
    setLoadingInitial(true)
    setHasMore(false)
    hasMoreRef.current = false
    offsetRef.current = 0
    try {
      const dataUrl = tab === 'contact' ? buildContactsUrl(0, f) : buildMembersUrl(0, f)
      const statsUrl = tab === 'contact'
        ? `/api/calling/contacts/campaign?campaignId=${campaignId}&stats=true`
        : `/api/calling/members?campaignId=${campaignId}&stats=true`

      const [dataRes, statsRes] = await Promise.all([
        fetch(dataUrl, { signal: controller.signal }),
        fetch(statsUrl, { signal: controller.signal }),
      ])
      const dataJson = await dataRes.json()
      if (seq !== loadSeqRef.current) return
      if (dataJson.noAccess) { setNoAccess(true); return }
      setContactsHidden(dataJson.contacts_hidden || false)
      const newRows = dataJson.data || []
      setMembers(newRows)
      setHasMore(dataJson.hasMore || false)
      hasMoreRef.current = dataJson.hasMore || false
      offsetRef.current = newRows.length
      setSelectedMembers(new Set())
      const statsJson = await statsRes.json()
      if (seq !== loadSeqRef.current) return
      if (statsJson.data) setStats(statsJson.data)
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('loadFirst', err)
    } finally {
      // รุ่นเก่าห้ามดับสปินเนอร์ของรุ่นใหม่ที่ยังโหลดอยู่
      if (seq === loadSeqRef.current) setLoadingInitial(false)
    }
  }, [campaignId])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return
    // ผูกกับรุ่นปัจจุบัน — สลับ tab กลางคัน แถวชุดนี้ต้องไม่ถูก append ต่อท้าย tab ใหม่
    const seq = loadSeqRef.current
    setLoadingMore(true)
    loadingMoreRef.current = true
    try {
      const url = activeTab === 'contact'
        ? buildContactsUrl(offsetRef.current, filters)
        : buildMembersUrl(offsetRef.current, filters)
      const res = await fetch(url, { signal: abortRef.current?.signal })
      const data = await res.json()
      if (seq !== loadSeqRef.current) return
      const newRows = data.data || []
      setMembers(prev => [...prev, ...newRows])
      setHasMore(data.hasMore || false)
      hasMoreRef.current = data.hasMore || false
      offsetRef.current += newRows.length
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('loadMore', err)
    } finally {
      setLoadingMore(false)
      loadingMoreRef.current = false
    }
  }, [activeTab, filters])

  const handleRecordSave = useCallback(async (payload) => {
    await fetch('/api/calling/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setRecordModalMember(null)
    await loadFirst(activeTab, filters)
  }, [activeTab, filters, loadFirst])

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
        // assigned_to = users.id (org migration) → key ด้วย user_id
        const map = {}
        const dmap = {}
        for (const u of uData.data) {
          map[u.user_id] = u.display_name
          if (u.discord_id) dmap[u.user_id] = u.discord_id
        }
        setUsersMap(map)
        setDiscordIdMap(dmap)
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
    loadFirst(activeTab, filters)
  }, [campaignId, activeTab, filters, loadFirst])

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
      await loadFirst(activeTab, filters)
    } catch (err) {
      alert(t('assignment.errorWithMessage', { message: err.message }))
    }
  }

  const handleUnassign = async () => {
    const ids = Array.from(selectedMembers)
    if (!confirm(t('assignment.unassignConfirm', { count: ids.length }))) return
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
      await loadFirst(activeTab, filters)
    } catch (err) {
      alert(t('assignment.errorWithMessage', { message: err.message }))
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
    setFilterStarred('')
    setFilterSigLocation('')
    setFilterSigAvailability('')
    setFilterSigInterest('')
    setSelectedMembers(new Set())
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
    .map(a => ({ id: a.id, name: usersMap[a.id] || String(a.id), count: a.count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const isAllSelected = members.length > 0 && selectedMembers.size === members.length

  if (loadingInitial && !campaign) {
    return <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">{t('common.loading')}</div>
  }
  if (!loadingInitial && !campaign) {
    return <div className="py-20 text-center text-red-500 text-base">{t('campaignForm.notFound')}</div>
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
            {campaign?.name} <span className="text-warm-500 dark:text-disc-muted font-normal text-base">{t('assignment.roleLabel')}</span>
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-base text-warm-500 dark:text-disc-muted">
            <span>{activeTab === 'contact' ? t('assignment.tabContact') : t('assignment.tabMember')} <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.total}</span></span>
            <span>{t('assignment.calledLabel')} <span className="font-semibold text-warm-900 dark:text-disc-text">{stats.called}/{stats.assigned}</span></span>
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
              {tab === 'member' ? t('assignment.tabMember') : t('assignment.tabContact')}
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
          placeholder={t('assignment.searchNamePlaceholder')}
          className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full sm:w-40"
        />
        <select value={filterAmphure} onChange={e => setFilterAmphure(e.target.value)} className={filterCls(filterAmphure)}>
          <option value="">{t('assignment.districtOption')}</option>
          {stats.districts.map(d => (
            <option key={d} value={d}>{d || t('assignment.notSpecified')} ({stats.districtCounts[d] || 0})</option>
          ))}
        </select>

        {/* subdistricts — member tab only */}
        {activeTab === 'member' && filterAmphure && (
          <div ref={subdistrictsRef} className="relative">
            {loadingSubdistricts ? (
              <div className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-bg2 text-warm-900 dark:text-disc-text rounded-lg flex items-center">
                {t('common.loading')}
              </div>
            ) : availableSubdistricts.length === 0 ? (
              <div className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-bg2 text-warm-400 dark:text-disc-muted rounded-lg flex items-center">
                {t('assignment.subdistrictNoneOption')}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setSubdistrictsOpen(!subdistrictsOpen)}
                  className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal w-full text-left flex justify-between items-center"
                >
                  {t('assignment.subdistrictLabel')} {filterSubdistricts.size > 0 && <span>({filterSubdistricts.size})</span>}
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
                        <span className="ml-2">{sub.name || t('assignment.notSpecified')} ({sub.count})</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={filterCls(filterTier)}>
          <option value="">{t('assignment.tierOption')}</option>
          {['A','B','C','D'].map(tierVal => <option key={tierVal} value={tierVal}>{tierVal}</option>)}
        </select>

        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className={filterCls(filterAssignee)}>
          <option value="">{t('assignment.assigneeOption')}</option>
          {assignees.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.count})</option>
          ))}
        </select>

        <select value={filterCalled} onChange={e => setFilterCalled(e.target.value)} className={filterCls(filterCalled)}>
          <option value="">{t('assignment.statusOption')}</option>
          <option value="called">{t('assignment.calledLabel')}</option>
          <option value="uncalled">{t('assignment.pendingCallLabel')}</option>
        </select>

        <select value={filterSms} onChange={e => setFilterSms(e.target.value)} className={filterCls(filterSms)}>
          <option value="">{t('assignment.smsOption')}</option>
          <option value="sms_sent">{t('assignment.smsSentOption')}</option>
          <option value="no_sms">{t('assignment.smsNotSentOption')}</option>
        </select>

        <button
          onClick={() => setFilterStatus(filterStatus === 'unassigned' ? '' : 'unassigned')}
          className={`h-11 px-3 text-base border rounded-lg transition-colors whitespace-nowrap ${
            filterStatus === 'unassigned'
              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
              : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}
        >
          {t('assignment.statusUnassigned')}
        </button>

        <button
          onClick={() => setFilterStarred(filterStarred === 'starred' ? '' : 'starred')}
          className={`h-11 px-3 text-base border rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            filterStarred === 'starred'
              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
              : 'border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}
        >
          <Star className={`w-4 h-4 shrink-0 ${filterStarred === 'starred' ? 'fill-current' : ''}`} />
          {t('assignment.starredFilterLabel')}
        </button>

        {/* สัญญาณจากสายล่าสุด — มีทั้ง 2 tab เพราะเก็บที่ calling_logs ร่วมกัน */}
        <select value={filterSigLocation} onChange={e => setFilterSigLocation(e.target.value)} className={filterCls(filterSigLocation)}>
          <option value="">{t('assignment.sigLocationOption')}</option>
          <option value="high">{t('assignment.sigLocationHigh')}</option>
          <option value="mid">{t('assignment.sigLocationMid')}</option>
          <option value="low">{t('assignment.sigLocationLow')}</option>
        </select>

        <select value={filterSigAvailability} onChange={e => setFilterSigAvailability(e.target.value)} className={filterCls(filterSigAvailability)}>
          <option value="">{t('assignment.sigAvailabilityOption')}</option>
          <option value="high">{t('assignment.sigAvailabilityHigh')}</option>
          <option value="mid">{t('assignment.sigAvailabilityMid')}</option>
          <option value="low">{t('assignment.sigAvailabilityLow')}</option>
        </select>

        <select value={filterSigInterest} onChange={e => setFilterSigInterest(e.target.value)} className={filterCls(filterSigInterest)}>
          <option value="">{t('assignment.sigInterestOption')}</option>
          <option value="high">{t('assignment.sigInterestHigh')}</option>
          <option value="mid">{t('assignment.sigInterestMid')}</option>
          <option value="low">{t('assignment.sigInterestLow')}</option>
        </select>

        {/* member-only filters */}
        {activeTab === 'member' && <>
          <select value={filterRsvp} onChange={e => setFilterRsvp(e.target.value)} className={filterCls(filterRsvp)}>
            <option value="">{t('assignment.rsvpOption')}</option>
            <option value="yes">{t('assignment.rsvpYes')}</option>
            <option value="no">{t('assignment.rsvpNo')}</option>
            <option value="maybe">{t('assignment.rsvpMaybe')}</option>
          </select>

          <select value={filterExpiry} onChange={e => setFilterExpiry(e.target.value)} className={filterCls(filterExpiry)}>
            <option value="">{t('assignment.membershipOption')}</option>
            <option value="lifetime">{t('assignment.membershipLifetime')}</option>
            <option value="expiring">{t('assignment.membershipExpiringOption')}</option>
            <option value="expired">{t('assignment.membershipExpiredOption')}</option>
          </select>

          <select value={filterSort} onChange={e => setFilterSort(e.target.value)} className={filterCls(filterSort)}>
            <option value="">{t('assignment.sortDefaultOption')}</option>
            <option value="least_called">{t('assignment.sortLeastCalled')}</option>
            <option value="uncalled">{t('assignment.sortUncalledCampaign')}</option>
            <option value="tier">{t('assignment.tierOption')}</option>
          </select>
        </>}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-500 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700 rounded-lg transition-colors whitespace-nowrap"
          >
            {t('assignment.clearFilterButton')}
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
              ? t('assignment.selectedCountLabel', { selected: selectedMembers.size, total: members.length })
              : t('assignment.nameHeaderLabel', { count: loadingInitial ? '...' : members.length })}
          </span>
          <span className="md:hidden text-center">{t('assignment.callColumnHeader')}</span>
          <span className="hidden md:block">{t('assignment.assignedColumnHeader')}</span>
          <span className="hidden md:block">{activeTab === 'contact' ? t('assignment.categoryColumnHeader') : t('assignment.subdistrictLabel')}</span>
          <span className="hidden md:block text-center">{t('assignment.callColumnHeader')}</span>
        </div>

        {/* Rows */}
        {loadingInitial ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-base">{t('common.loading')}</div>
        ) : noAccess ? (
          <div className="px-6 py-10 text-center">
            <p className="text-base text-warm-700 dark:text-disc-text font-medium mb-1">{t('assignment.noAccessTitle')}</p>
            <p className="text-base text-warm-400 dark:text-disc-muted">{t('assignment.noAccessSubtitle')}</p>
          </div>
        ) : members.length === 0 ? (
          <div className="px-6 py-8 text-center text-warm-400 dark:text-disc-muted text-base">
            {activeTab === 'contact' ? t('assignment.emptyContacts') : t('assignment.emptyMembers')}
          </div>
        ) : (
          <div>
            {members.map((item, idx) => {
              const itemId  = getItemId(item)
              const tier    = item.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const status  = item.member_status || 'unassigned'
              const badge   = getStatusBadge(status, t)
              // member-specific
              const isMember  = activeTab === 'member'
              // starred_by = user_id ของทุกคนที่ติดดาว · usersMap โหลดมาแล้วตอนเปิดหน้า ไม่ต้องยิงเพิ่ม
              const starredByNames = (item.starred_by || []).map(uid => usersMap[uid] || uid).join(', ')
              const flagOption = getFlagOption(item.flag)
              const hasPhone  = contactsHidden || !!(isMember ? item.mobile_number : item.phone)
              const dimmed    = !hasPhone ? 'opacity-50' : ''
              const expiryIcon = isMember ? getExpiryIcon(item.expired_at, t) : null
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
                        {flagOption && (
                          <span className="shrink-0 w-2.5 h-2.5 rounded-full block" title={t(flagOption.labelKey)}
                            style={flagDotStyle(flagOption.color)} />
                        )}
                        {isMember && (item.membership_type === 'ตลอดชีพ' || item.membership_type === 'สมาชิกตลอดชีพ') && (
                          <Infinity title={t('assignment.lifetimeMemberTitle')} className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
                        )}
                        {expiryIcon && <expiryIcon.Icon title={expiryIcon.title} style={{ color: expiryIcon.color }} className="w-4 h-4 shrink-0 inline-block" />}
                        {catColor && <span className="md:hidden shrink-0 text-sm px-1.5 py-0.5 rounded font-medium" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
                        {!hasPhone && <span className="shrink-0 text-base text-warm-400 dark:text-disc-muted font-normal">{t(item.phone_hidden ? 'assignment.phoneHiddenLabel' : 'assignment.noPhoneLabel')}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-base text-warm-500 dark:text-disc-text truncate">
                        <span className="shrink-0 w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: badge.text }} />
                        <span className="truncate">
                          {[tambon, amphoe, item.assigned_to ? usersMap[item.assigned_to] || item.assigned_to : null]
                            .filter(Boolean).join(' · ')}
                        </span>
                        {item.star_count > 0 && (
                          // ชื่อคนติดดาวอยู่ใน tooltip เท่านั้น — เคยพิมพ์ต่อท้ายบรรทัดแล้ว user บอกว่ารก
                          <span className="shrink-0 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
                            title={starredByNames ? t('assignment.starredByLabel', { names: starredByNames }) : undefined}>
                            <Star className="w-3.5 h-3.5 fill-current" />
                            <span className="text-sm font-medium tabular-nums">{item.star_count}</span>
                          </span>
                        )}
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
                        ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.called.color }}><PhoneCall className="w-4 h-4" /><span className="text-sm font-medium">{t('assignment.calledLabel')}</span></span>
                        : item.assigned_to
                          ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.pending.color }}><Clock className="w-4 h-4" /><span className="text-sm font-medium">{t('assignment.pendingCallLabel')}</span></span>
                          : <span className="text-warm-300 dark:text-disc-muted text-sm">—</span>}
                    </div>
                    <div className={`hidden md:block text-base truncate pr-2 ${dimmed}`}>
                      {item.assigned_to
                        ? (discordIdMap[item.assigned_to]
                            ? <a href={`https://discord.com/users/${discordIdMap[item.assigned_to]}`} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{usersMap[item.assigned_to] || item.assigned_to}</a>
                            : <span className="text-warm-700 dark:text-disc-text">{usersMap[item.assigned_to] || item.assigned_to}</span>)
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
                        ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.called.color }}><PhoneCall className="w-4 h-4" /><span className="text-sm font-medium">{t('assignment.calledLabel')}</span></span>
                        : item.assigned_to
                          ? <span className="inline-flex items-center gap-1" style={{ color: STATUS_ICONS.pending.color }}><Clock className="w-4 h-4" /><span className="text-sm font-medium">{t('assignment.pendingCallLabel')}</span></span>
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
            ? t('assignment.loadingMoreLabel')
            : !loadingInitial && members.length > 0
              ? hasMore ? '' : (activeTab === 'contact'
                  ? t('assignment.showingAllContacts', { count: members.length })
                  : t('assignment.showingAllMembers', { count: members.length }))
              : ''}
        </div>
      </div>

      {/* Floating toolbar */}
      {selectedMembers.size > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto flex items-center gap-3 bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl sm:rounded-full shadow-lg px-5 py-3 z-40">
          <button onClick={() => setSplitModalOpen(true)}
            className="flex-1 sm:flex-none px-4 py-2 bg-teal hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
            {t('assignment.assignButton', { count: selectedMembers.size })}
          </button>
          <button onClick={handleUnassign}
            className="flex-1 sm:flex-none px-4 py-2 bg-red-500 hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
            {t('assignment.unassignButton', { count: selectedMembers.size })}
          </button>
          {canSendBulkSms && (
            <button onClick={() => setSmsModalOpen(true)}
              className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:opacity-90 text-white text-base font-medium rounded-full transition text-center">
              {t('assignment.smsButton', { count: selectedMembers.size })}
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
        defaultMessage={buildSmsTemplate(campaign?.name, campaign?.event_date, campaign?.act_event_id)}
        onClose={() => setSmsModalOpen(false)}
        onDone={() => {
          setSmsModalOpen(false)
          setSelectedMembers(new Set())
          loadFirst(activeTab, filters)
        }}
      />

    </div>
  )
}
