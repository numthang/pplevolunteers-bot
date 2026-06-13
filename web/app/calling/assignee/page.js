'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import RecordCallModal from '@/components/calling/RecordCallModal.jsx'
import PdpaAgreementModal from '@/components/calling/PdpaAgreementModal.jsx'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/../config/callingCategories.js'
import { PhoneCall, PhoneOff, Clock, Minus, Users, MessageSquare, AlertTriangle, Timer, Star, IdCard, BookUser, History } from 'lucide-react'

const MODERATOR_ROLES = ['Admin', 'เลขาธิการ', 'Moderator']
const EDIT_STATUS_OPTIONS = [
  { value: 'answered',   label: 'รับสาย' },
  { value: 'no_answer',  label: 'ไม่รับ' },
  { value: 'not_called', label: 'ไม่โทร' },
]

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


function getExpiryIcon(expiredAt) {
  if (!expiredAt) return null
  const now = Date.now()
  const exp = new Date(expiredAt).getTime()
  if (exp < now) return { Icon: AlertTriangle, color: '#ef4444', title: 'หมดอายุ' }
  if (exp - now < 90 * 24 * 60 * 60 * 1000) return { Icon: Timer, color: '#d97706', title: 'ใกล้หมดอายุ' }
  return null
}

const STATUS_ICONS = {
  pending:       { Icon: Clock,         color: '#ff9800',  title: 'รอโทร' },
  called:        { Icon: PhoneCall,     color: '#0d9e94',  title: 'โทรแล้ว' },
  answered:      { Icon: PhoneCall,     color: '#0d9e94',  title: 'รับสาย' },
  no_answer:     { Icon: PhoneOff,      color: '#854f0b',  title: 'ไม่รับ' },
  not_called:    { Icon: Minus,         color: '#9ca3af',  title: 'ไม่โทร' },
  met:           { Icon: Users,         color: '#1a5e2d',  title: 'พบปะ' },
  sms_sent:      { Icon: MessageSquare, color: '#4338ca',  title: 'ส่ง SMS' },
  sms_delivered: { Icon: MessageSquare, color: '#1d4ed8',  title: 'SMS ถึง' },
  sms_failed:    { Icon: AlertTriangle, color: '#a32d2d',  title: 'SMS ล้มเหลว' },
}

function getStatusIcon(callStatus, logStatus) {
  if (callStatus === 'pending') return STATUS_ICONS.pending
  return STATUS_ICONS[logStatus] || STATUS_ICONS.pending
}

const STATUS_OPTIONS = [
  { value: '',        label: 'ทั้งหมด' },
  { value: 'pending', label: 'รอโทร' },
  { value: 'called',  label: 'โทรแล้ว' },
]

function getItemKey(item) {
  return item.source_id != null ? `m-${item.source_id}-${item.campaign_id}` : `c-${item.id}-${item.campaign_id}`
}

function getItemId(item) {
  return item.source_id ?? item.id
}

function MemberAvatar({ item, size = 36 }) {
  const tier = item.tier || 'D'
  const tc = TIER_COLORS[tier] || { bg: '#f3f4f6', text: '#6b7280' }
  const name = item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' ')
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0] || '?').slice(0, 2).toUpperCase()
  if (item.discord_avatar) {
    return (
      <img src={item.discord_avatar} alt={name} title={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full flex items-center justify-center font-bold flex-shrink-0 select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), backgroundColor: tc.bg, color: tc.text }}>
      {initials}
    </div>
  )
}

export default function PendingCallsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'member')
  const [tabCounts, setTabCounts] = useState({ member: null, contact: null })
  const [campaigns, setCampaigns] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCampaign, setFilterCampaign] = useState(() => searchParams.get('campaign') || '')
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') ?? '')
  const [filterRsvp, setFilterRsvp] = useState(() => searchParams.get('rsvp') || '')

  const [modalItem, setModalItem] = useState(null)
  const [modalIndex, setModalIndex] = useState(-1)

  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState('')
  const [historyVersion, setHistoryVersion] = useState(0)

  const [starredItems, setStarredItems] = useState([])
  const [starredLoading, setStarredLoading] = useState(false)
  const [starredSearch, setStarredSearch] = useState('')
  const [debouncedStarredSearch, setDebouncedStarredSearch] = useState('')
  const [starredVersion, setStarredVersion] = useState(0)
  const [favoriteSet, setFavoriteSet] = useState(new Set())

  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)
  const isModerator = MODERATOR_ROLES.some(r => effectiveRoles.includes(r))

  const itemsRef = useRef([])
  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedHistorySearch(historySearch), 400)
    return () => clearTimeout(t)
  }, [historySearch])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedStarredSearch(starredSearch), 400)
    return () => clearTimeout(t)
  }, [starredSearch])

  useEffect(() => {
    if (activeTab !== 'history') return
    setHistoryLoading(true)
    const p = new URLSearchParams({ history: 'true', flat: 'true', limit: '60' })
    if (debouncedHistorySearch) p.set('name', debouncedHistorySearch)
    fetch(`/api/calling/pending?${p}`)
      .then(r => r.json())
      .then(d => setHistoryItems(d.data || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [activeTab, debouncedHistorySearch, historyVersion])

  useEffect(() => {
    if (activeTab !== 'starred') return
    setStarredLoading(true)
    const p = new URLSearchParams({ display: 'true', limit: '100' })
    if (debouncedStarredSearch) p.set('name', debouncedStarredSearch)
    fetch(`/api/calling/starred?${p}`)
      .then(r => r.json())
      .then(d => setStarredItems(d.data || []))
      .catch(() => {})
      .finally(() => setStarredLoading(false))
  }, [activeTab, debouncedStarredSearch, starredVersion])

  useEffect(() => {
    Promise.all([
      fetch('/api/calling/starred?idsOnly=true&contactType=member').then(r => r.json()),
      fetch('/api/calling/starred?idsOnly=true&contactType=contact').then(r => r.json()),
    ]).then(([m, c]) => {
      const s = new Set()
      ;(m.data || []).forEach(id => s.add(`${id}:member`))
      ;(c.data || []).forEach(id => s.add(`${id}:contact`))
      setFavoriteSet(s)
    }).catch(() => {})
  }, [starredVersion])

  // sync URL
  useEffect(() => {
    const p = new URLSearchParams()
    if (activeTab !== 'member') p.set('tab', activeTab)
    if (filterCampaign) p.set('campaign', filterCampaign)
    if (filterStatus)   p.set('status', filterStatus)
    if (activeTab === 'member' && filterRsvp) p.set('rsvp', filterRsvp)
    const qs = p.toString()
    router.replace(qs ? `/calling/assignee?${qs}` : '/calling/assignee', { scroll: false })
  }, [activeTab, filterCampaign, filterStatus, filterRsvp])

  useEffect(() => {
    fetch('/api/calling/pending?campaigns=true')
      .then(r => r.json())
      .then(d => setCampaigns(d.data || []))
      .catch(() => {})
    Promise.all([
      fetch('/api/calling/pending?count=true&type=member').then(r => r.json()),
      fetch('/api/calling/pending?count=true&type=contact').then(r => r.json()),
    ]).then(([m, c]) => setTabCounts({ member: m.count ?? null, contact: c.count ?? null }))
      .catch(() => {})
  }, [])

  const fetchItems = useCallback(async (tab, campaignId, status, rsvp) => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '200', type: tab })
      if (campaignId) p.set('campaignId', campaignId)
      if (status) p.set('status', status)
      if (tab === 'member' && rsvp) p.set('rsvp', rsvp)
      const res = await fetch(`/api/calling/pending?${p}`)
      const data = await res.json()
      setItems(data.data || [])
    } catch (err) {
      console.error('fetchItems', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems(activeTab, filterCampaign, filterStatus, filterRsvp)
  }, [activeTab, filterCampaign, filterStatus, filterRsvp, fetchItems])

  // สลับ guild → รีโหลดแคมเปญ/นับ/รายการ/ดาว ใหม่ทั้งหมด
  useEffect(() => {
    function onSwitch() {
      fetch('/api/calling/pending?campaigns=true')
        .then(r => r.json()).then(d => setCampaigns(d.data || [])).catch(() => {})
      Promise.all([
        fetch('/api/calling/pending?count=true&type=member').then(r => r.json()),
        fetch('/api/calling/pending?count=true&type=contact').then(r => r.json()),
      ]).then(([m, c]) => setTabCounts({ member: m.count ?? null, contact: c.count ?? null })).catch(() => {})
      fetchItems(activeTab, filterCampaign, filterStatus, filterRsvp)
      setHistoryVersion(v => v + 1)
      setStarredVersion(v => v + 1)
    }
    window.addEventListener('guild-switched', onSwitch)
    return () => window.removeEventListener('guild-switched', onSwitch)
  }, [activeTab, filterCampaign, filterStatus, filterRsvp, fetchItems])

  const toggleFavorite = useCallback(async (e, memberId, contactType) => {
    e.stopPropagation()
    const key = `${memberId}:${contactType}`
    const isFav = favoriteSet.has(key)
    setFavoriteSet(prev => {
      const next = new Set(prev)
      isFav ? next.delete(key) : next.add(key)
      return next
    })
    try {
      if (isFav) {
        await fetch(`/api/calling/starred?memberId=${memberId}&contactType=${contactType}`, { method: 'DELETE' })
      } else {
        await fetch('/api/calling/starred', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId: String(memberId), contactType }),
        })
      }
      setStarredVersion(v => v + 1)
    } catch {
      setFavoriteSet(prev => {
        const next = new Set(prev)
        isFav ? next.add(key) : next.delete(key)
        return next
      })
    }
  }, [favoriteSet])

  const switchTab = (tab) => {
    if (tab === activeTab) return
    setActiveTab(tab)
    setFilterCampaign('')
    setFilterStatus('')
    setFilterRsvp('')
    setItems([])
    setModalItem(null)
    setModalIndex(-1)
    setHistorySearch('')
    setDebouncedHistorySearch('')
    setHistoryItems([])
    setStarredSearch('')
    setDebouncedStarredSearch('')
    setStarredItems([])
  }

  const openModal = (item) => {
    const key = getItemKey(item)
    const idx = itemsRef.current.findIndex(m => getItemKey(m) === key)
    setModalItem(item)
    setModalIndex(idx)
  }

  const closeModal = () => {
    setModalItem(null)
    setModalIndex(-1)
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && modalItem) closeModal()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [modalItem])

  const findNextPendingIndex = useCallback((fromIndex) => {
    const list = itemsRef.current
    for (let i = fromIndex + 1; i < list.length; i++) {
      if (list[i].call_status === 'pending') return i
    }
    return -1
  }, [])

  const hasNext = modalIndex >= 0 && findNextPendingIndex(modalIndex) >= 0

  const markItemCalled = (item, payload) => {
    const key = getItemKey(item)
    setItems(prev => prev.map(m =>
      getItemKey(m) === key
        ? { ...m, call_status: 'called', camp_calls: (m.camp_calls || 0) + 1, latest_log_status: payload.status, latest_note: payload.note ?? m.latest_note }
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
    if (payload.rsvp && activeTab === 'member') {
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
      if (activeTab === 'history') setHistoryVersion(v => v + 1)
      else if (activeTab === 'starred') setStarredVersion(v => v + 1)
      else fetchItems(activeTab, filterCampaign, filterStatus, filterRsvp)
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  const handleSaveAndNext = async (payload) => {
    try {
      await submitLog(payload)
      markItemCalled(modalItem, payload)
      const updatedList = itemsRef.current.map(m =>
        getItemKey(m) === getItemKey(modalItem)
          ? { ...m, call_status: 'called', latest_log_status: payload.status }
          : m
      )
      const nextIdx = updatedList.findIndex((m, i) => i > modalIndex && m.call_status === 'pending')
      if (nextIdx >= 0) {
        setModalItem(updatedList[nextIdx])
        setModalIndex(nextIdx)
      } else {
        closeModal()
        fetchItems(activeTab, filterCampaign, filterStatus, filterRsvp)
      }
    } catch (err) {
      alert(err.message)
      throw err
    }
  }

  const pdpaKey = 'pdpa_calling'

  const totalPending = items.filter(m => m.call_status === 'pending').length
  const totalCalled  = items.filter(m => m.call_status === 'called').length
  const total = items.length

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-disc-text mb-1">Pending calls <span className="text-warm-400 dark:text-disc-muted font-normal">(assignee)</span></h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">รายชื่อที่ได้รับ assign มาให้คุณโทร</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-warm-200 dark:border-disc-border">
        {['member', 'contact'].map(tab => {
          const count = tabCounts[tab]
          const TabIcon = tab === 'member' ? IdCard : BookUser
          return (
            <button key={tab} onClick={() => switchTab(tab)}
              className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-teal text-teal'
                  : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              <TabIcon className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{tab === 'member' ? 'Member' : 'Contact'}</span>
              {count !== null && (
                <span className={`text-sm px-1.5 py-0.5 rounded-full font-normal ${
                  activeTab === tab
                    ? 'bg-teal/10 text-teal'
                    : 'bg-warm-100 dark:bg-disc-header text-warm-500 dark:text-disc-muted'
                }`}>{count}</span>
              )}
            </button>
          )
        })}
        <button onClick={() => switchTab('history')}
          className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-teal text-teal'
              : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}>
          <History className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">History</span>
        </button>
        <button onClick={() => switchTab('starred')}
          className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
            activeTab === 'starred'
              ? 'border-teal text-teal'
              : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}>
          <Star className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Starred</span>
          {favoriteSet.size > 0 && (
            <span className={`text-sm px-1.5 py-0.5 rounded-full font-normal ${
              activeTab === 'starred'
                ? 'bg-teal/10 text-teal'
                : 'bg-warm-100 dark:bg-disc-header text-warm-500 dark:text-disc-muted'
            }`}>{favoriteSet.size}</span>
          )}
        </button>
      </div>

      {/* History tab */}
      {activeTab === 'history' && (
        <div>
          <input
            type="text"
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
            placeholder="ค้นหาชื่อ เบอร์ หรือ note ที่เคยเขียน..."
            className="w-full h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal mb-4"
          />
          {historyLoading ? (
            <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
          ) : historyItems.length === 0 ? (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl py-16 text-center text-warm-400 dark:text-disc-muted text-base">
              {historySearch ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีประวัติการโทร'}
            </div>
          ) : (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden">
              <div className="divide-y divide-warm-200 dark:divide-disc-border">
                {historyItems.map(log => {
                  const tier = log.tier || 'D'
                  const tierColor = TIER_COLORS[tier]
                  const si = STATUS_ICONS[log.status]
                  const statusColor = CALL_STATUS_COLORS[log.status]
                  const logMemberId = log.member_id
                  const logContactType = log.contact_type || 'member'
                  const isLogFav = favoriteSet.has(`${logMemberId}:${logContactType}`)
                  return (
                    <div key={log.log_id} className="relative group hover:bg-warm-50 dark:hover:bg-disc-hover transition">
                    <div onClick={() => {
                      setModalItem({
                        source_id: log.contact_type === 'member' ? log.member_id : undefined,
                        id: log.contact_type === 'contact' ? log.member_id : undefined,
                        full_name: log.full_name,
                        mobile_number: log.mobile_number,
                        home_district: log.home_district,
                        home_amphure: log.home_amphure,
                        home_province: log.home_province,
                        discord_avatar: log.discord_avatar,
                        discord_id: log.discord_id,
                        tier: log.tier,
                        campaign_id: log.campaign_id || 0,
                        campaign_name: log.campaign_name,
                        contact_type: log.contact_type,
                      })
                      setModalIndex(-1)
                    }} className="w-full text-left px-4 py-3 flex items-start gap-3 cursor-pointer">
                      <MemberAvatar item={log} size={60} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text">{log.full_name}</span>
                          <span className="text-xs font-bold shrink-0 px-1 py-px rounded" style={{ color: tierColor.text, backgroundColor: tierColor.bg }}>{tier}</span>
                          <button onClick={e => toggleFavorite(e, logMemberId, logContactType)} className="p-0.5 flex-shrink-0" title={isLogFav ? 'ยกเลิก starred' : 'เพิ่ม starred'}>
                            <Star className={`w-5 h-5 transition ${isLogFav ? 'fill-yellow-400 text-yellow-400' : 'text-warm-300 dark:text-disc-border'}`} />
                          </button>
                          {si && <span className="inline-flex items-center gap-1 shrink-0" style={{ color: si.color }}><si.Icon className="w-3.5 h-3.5" /><span className="text-sm font-medium">{statusColor?.label || log.status}</span></span>}
                        </div>
                        {log.note && (
                          <div className="text-sm text-warm-800 dark:text-disc-text mt-0.5 italic">"{log.note}"</div>
                        )}
                        <div className="text-sm text-warm-400 dark:text-disc-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {log.campaign_name && <span>{log.campaign_name}</span>}
                          {log.campaign_name && log.called_at && <span>·</span>}
                          {log.called_at && <span>{new Date(log.called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>}
                        </div>
                      </div>
                    </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Starred tab */}
      {activeTab === 'starred' && (
        <div>
          <input
            type="text"
            value={starredSearch}
            onChange={e => setStarredSearch(e.target.value)}
            placeholder="ค้นหาชื่อหรือเบอร์..."
            className="w-full h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-teal mb-4"
          />
          {starredLoading ? (
            <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
          ) : starredItems.length === 0 ? (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl py-16 text-center text-warm-400 dark:text-disc-muted text-base">
              {starredSearch ? 'ไม่พบผลลัพธ์' : 'ยังไม่มีรายการที่ starred'}
            </div>
          ) : (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden">
              <div className="divide-y divide-warm-200 dark:divide-disc-border">
                {starredItems.map(item => {
                  const tier = item.tier || 'D'
                  const tierColor = TIER_COLORS[tier]
                  const isContact = item.contact_type === 'contact'
                  const catColor = isContact && item.category ? (CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other) : null
                  return (
                    <div key={`${item.contact_type}-${item.member_id}`} className="flex items-center hover:bg-warm-50 dark:hover:bg-disc-hover transition">
                      <button
                        onClick={() => {
                          setModalItem({
                            source_id: !isContact ? item.member_id : undefined,
                            id: isContact ? item.member_id : undefined,
                            full_name: item.full_name,
                            mobile_number: item.mobile_number,
                            home_district: item.home_district,
                            home_amphure: item.home_amphure,
                            home_province: item.home_province,
                            discord_avatar: item.discord_avatar,
                            discord_id: item.discord_id,
                            tier: item.tier,
                            membership_type: item.membership_type,
                            campaign_id: 0,
                            contact_type: item.contact_type,
                          })
                          setModalIndex(-1)
                        }}
                        className="flex-1 text-left px-4 py-3 flex items-start gap-3 min-w-0"
                      >
                        <MemberAvatar item={item} size={60} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-base font-medium text-warm-900 dark:text-disc-text">{item.full_name}</span>
                            <span className="text-xs font-bold shrink-0 px-1 py-px rounded" style={{ color: tierColor.text, backgroundColor: tierColor.bg }}>{tier}</span>
                            {catColor && <span className="text-sm px-1 py-px rounded font-medium shrink-0" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 text-base truncate mt-0.5">
                            {item.mobile_number && <span className="text-teal font-medium">{item.mobile_number}</span>}
                            {item.mobile_number && item.home_amphure && <span className="text-warm-300 dark:text-disc-muted/40">·</span>}
                            {item.home_amphure && <span className="text-warm-400 dark:text-disc-muted truncate">{item.home_amphure}</span>}
                          </div>
                          {item.fav_note && (
                            <div className="text-sm text-warm-500 dark:text-disc-muted mt-0.5 italic">"{item.fav_note}"</div>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={e => toggleFavorite(e, item.member_id, item.contact_type)}
                        className="px-4 py-3 shrink-0 text-yellow-400 hover:text-yellow-500 transition"
                        title="ยกเลิก starred"
                      >
                        <Star className="w-5 h-5 fill-yellow-400" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {activeTab !== 'history' && activeTab !== 'starred' && <div className="space-y-2 mb-5">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="w-full h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
        >
          <option value="">Campaign (ทั้งหมด)</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg border border-warm-200 dark:border-disc-border overflow-hidden">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`flex-1 sm:flex-none px-4 py-2.5 text-sm sm:text-base font-medium whitespace-nowrap transition ${
                filterStatus === opt.value
                  ? 'bg-teal text-white'
                  : 'bg-card-bg text-warm-700 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {activeTab === 'member' && (
          <select
            value={filterRsvp}
            onChange={e => setFilterRsvp(e.target.value)}
            className="w-full h-11 px-3 text-base border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text rounded-lg focus:outline-none focus:ring-2 focus:ring-teal"
          >
            <option value="">RSVP (ทั้งหมด)</option>
            <option value="yes">✓ เข้าร่วม</option>
            <option value="no">✗ ไม่เข้าร่วม</option>
            <option value="maybe">? อาจจะ</option>
          </select>
        )}
      </div>}

      {activeTab !== 'history' && activeTab !== 'starred' && !loading && total > 0 && (
        <div className="flex gap-6 mb-5 text-base">
          <div>
            <span className="text-warm-500 dark:text-disc-muted">ทั้งหมด:</span>
            <span className="ml-1.5 font-semibold text-warm-900 dark:text-disc-text">{total}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-disc-muted">รอโทร:</span>
            <span className="ml-1.5 font-semibold text-orange-600">{totalPending}</span>
          </div>
          <div>
            <span className="text-warm-500 dark:text-disc-muted">โทรแล้ว:</span>
            <span className="ml-1.5 font-semibold text-teal">{totalCalled}</span>
          </div>
        </div>
      )}

      {/* List */}
      {activeTab !== 'history' && activeTab !== 'starred' && (loading ? (
        <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl py-16 text-center text-warm-400 dark:text-disc-muted text-base">
          {filterStatus === 'pending' ? 'โทรครบทุกคนแล้ว 🎉' : 'ไม่มีรายการ'}
        </div>
      ) : (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden">
          {/* Table header — desktop only */}
          <div className={`hidden sm:grid items-center px-4 py-2.5 gap-2 bg-warm-100 dark:bg-disc-header border-b border-warm-200 dark:border-disc-border text-sm font-medium text-warm-500 dark:text-disc-muted ${activeTab === 'contact' ? '[grid-template-columns:1fr_80px_88px]' : '[grid-template-columns:1fr_88px]'}`}>
            <span>ชื่อ</span>
            {activeTab === 'contact' && <span className="text-center">ประเภท</span>}
            <span className="text-right">สถานะ</span>
          </div>

          <div className="divide-y divide-warm-200 dark:divide-disc-border">
            {items.map(item => {
              const isContact = activeTab === 'contact'
              const tier = item.tier || 'D'
              const tierColor = TIER_COLORS[tier]
              const displayName = item.full_name || [item.first_name, item.last_name].filter(Boolean).join(' ')
              const phone = item.mobile_number || item.phone
              const amphoe = item.home_amphure || item.amphoe
              const expiryIcon = isContact ? null : getExpiryIcon(item.expired_at)
              const catColor = isContact && item.category ? (CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other) : null
              const itemMemberId = isContact ? item.id : item.source_id
              const itemContactType = isContact ? 'contact' : 'member'
              const isFav = favoriteSet.has(`${itemMemberId}:${itemContactType}`)

              return (
                <div
                  key={getItemKey(item)}
                  className="relative group hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                >
                <div
                  onClick={() => openModal(item)}
                  className="w-full text-left px-4 py-4 cursor-pointer"
                >
                  {/* Mobile layout */}
                  <div className="sm:hidden">
                    <div className="flex items-center gap-3">
                      <MemberAvatar item={item} size={60} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text group-hover:text-teal transition-colors truncate">
                            {displayName}
                          </span>
                          <span className="text-xs font-bold flex-shrink-0 px-1 py-px rounded" style={{ color: tierColor.text, backgroundColor: tierColor.bg }}>{tier}</span>
                          <button onClick={e => toggleFavorite(e, itemMemberId, itemContactType)} className="p-0.5 flex-shrink-0" title={isFav ? 'ยกเลิก starred' : 'เพิ่ม starred'}>
                            <Star className={`w-5 h-5 transition ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-warm-300 dark:text-disc-border'}`} />
                          </button>
                          {expiryIcon && <expiryIcon.Icon title={expiryIcon.title} style={{ color: expiryIcon.color }} className="w-4 h-4 flex-shrink-0 inline-block" />}
                          {catColor && <span className="text-sm px-1 py-px rounded font-medium flex-shrink-0" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-base truncate mt-0.5">
                          {phone && <span className="text-teal font-medium">{phone}</span>}
                          {phone && amphoe && <span className="text-warm-300 dark:text-disc-muted/40">·</span>}
                          {amphoe && <span className="text-warm-400 dark:text-disc-muted truncate">{amphoe}</span>}
                        </div>
                        {item.latest_note && (
                          <div className="text-base text-warm-600 dark:text-disc-text mt-1 italic whitespace-pre-wrap break-words">
                            "{item.latest_note}"
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {(() => {
                          const si = getStatusIcon(item.call_status, item.latest_log_status)
                          return (
                            <div className="flex items-center gap-1">
                              {!isContact && item.rsvp && (
                                <span className="text-base font-bold" style={{ color: RSVP_ICONS[item.rsvp]?.color || '#666' }}>
                                  {RSVP_ICONS[item.rsvp]?.icon || item.rsvp}
                                </span>
                              )}
                              {si && <span className="inline-flex items-center gap-1" style={{ color: si.color }}><si.Icon className="w-4 h-4 flex-shrink-0" /><span className="text-sm font-medium whitespace-nowrap">{si.title}</span></span>}
                            </div>
                          )
                        })()}
                        <span className="text-base text-warm-400 dark:text-disc-muted">
                          {item.answered_count}/{item.total_calls} รับ
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className={`hidden sm:grid items-center gap-2 ${isContact ? '[grid-template-columns:1fr_80px_88px]' : '[grid-template-columns:1fr_88px]'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar item={item} size={60} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text group-hover:text-teal transition-colors truncate">
                            {displayName}
                          </span>
                          <span className="text-xs font-bold flex-shrink-0 px-1 py-px rounded" style={{ color: tierColor.text, backgroundColor: tierColor.bg }}>{tier}</span>
                          <button onClick={e => toggleFavorite(e, itemMemberId, itemContactType)} className="p-0.5 flex-shrink-0" title={isFav ? 'ยกเลิก starred' : 'เพิ่ม starred'}>
                            <Star className={`w-5 h-5 transition ${isFav ? 'fill-yellow-400 text-yellow-400' : 'text-warm-300 dark:text-disc-border'}`} />
                          </button>
                          {expiryIcon && <expiryIcon.Icon title={expiryIcon.title} style={{ color: expiryIcon.color }} className="w-4 h-4 flex-shrink-0 inline-block" />}
                        </div>
                        <div className="flex items-center gap-1.5 text-base truncate">
                          {phone && <span className="text-teal font-medium">{phone}</span>}
                          {phone && amphoe && <span className="text-warm-300 dark:text-disc-muted/40">·</span>}
                          {amphoe && <span className="text-warm-400 dark:text-disc-muted truncate">{amphoe}</span>}
                        </div>
                        {item.latest_note && (
                          <div className="text-base text-warm-600 dark:text-disc-text mt-0.5 italic whitespace-pre-wrap break-words">
                            "{item.latest_note}"
                          </div>
                        )}
                      </div>
                    </div>

                    {isContact && (
                      <div className="flex justify-center">
                        {catColor
                          ? <span className="text-sm px-1 py-px rounded font-medium" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>
                          : <span className="text-warm-300 dark:text-disc-muted text-sm">—</span>}
                      </div>
                    )}

                    <div className="flex items-center gap-1 justify-end">
                      {(() => {
                        const si = getStatusIcon(item.call_status, item.latest_log_status)
                        return (
                          <>
                            {!isContact && item.rsvp && (
                              <span className="text-base font-bold" style={{ color: RSVP_ICONS[item.rsvp]?.color || '#666' }}>
                                {RSVP_ICONS[item.rsvp]?.icon || item.rsvp}
                              </span>
                            )}
                            {si && <span className="inline-flex items-center gap-1" style={{ color: si.color }}><si.Icon className="w-4 h-4 flex-shrink-0" /><span className="text-sm font-medium whitespace-nowrap">{si.title}</span></span>}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <RecordCallModal
        isOpen={!!modalItem}
        member={modalItem}
        contact_type={modalItem?.contact_type || (activeTab === 'contact' ? 'contact' : 'member')}
        onClose={closeModal}
        onSave={handleSave}
        onSaveAndNext={handleSaveAndNext}
        hasNext={hasNext}
        onStarChange={(memberId, contactType, isActive) => {
          const key = `${memberId}:${contactType}`
          setFavoriteSet(prev => {
            const next = new Set(prev)
            isActive ? next.add(key) : next.delete(key)
            return next
          })
          setStarredVersion(v => v + 1)
        }}
        onFlagChange={(memberId, contactType, flag) => {
          setItems(prev => prev.map(m =>
            (String(m.source_id || m.id) === String(memberId) && (m.contact_type || 'member') === contactType)
              ? { ...m, flag }
              : m
          ))
        }}
      />

      {pdpaKey && <PdpaAgreementModal storageKey={pdpaKey} />}
    </div>
  )
}
