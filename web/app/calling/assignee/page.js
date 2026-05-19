'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import RecordCallModal from '@/components/calling/RecordCallModal.jsx'
import PdpaAgreementModal from '@/components/calling/PdpaAgreementModal.jsx'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/../config/callingCategories.js'

const MODERATOR_ROLES = ['Admin', 'เลขาธิการ', 'Moderator']
const EDIT_STATUS_OPTIONS = [
  { value: 'answered',   label: 'รับสาย' },
  { value: 'no_answer',  label: 'ไม่รับ' },
  { value: 'not_called', label: 'ไม่ได้โทร' },
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

function getItemKey(item) {
  return item.source_id != null ? `m-${item.source_id}-${item.campaign_id}` : `c-${item.id}-${item.campaign_id}`
}

function getItemId(item) {
  return item.source_id ?? item.id
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
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)
  const [historyLogsCache, setHistoryLogsCache] = useState({})
  const [editingLogId, setEditingLogId] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNote, setEditNote] = useState('')

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
    if (activeTab !== 'history') return
    setHistoryLoading(true)
    const p = new URLSearchParams({ history: 'true', limit: '50' })
    if (debouncedHistorySearch) p.set('name', debouncedHistorySearch)
    fetch(`/api/calling/pending?${p}`)
      .then(r => r.json())
      .then(d => setHistoryItems(d.data || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [activeTab, debouncedHistorySearch])

  const handleHistoryExpand = async (memberId) => {
    const next = expandedHistoryId === memberId ? null : memberId
    setExpandedHistoryId(next)
    if (next && !historyLogsCache[next]) {
      const res = await fetch(`/api/calling/logs?memberId=${next}`)
      const data = await res.json()
      setHistoryLogsCache(prev => ({ ...prev, [next]: data.data || [] }))
    }
  }

  const reloadHistoryLogs = async (memberId) => {
    const res = await fetch(`/api/calling/logs?memberId=${memberId}`)
    const data = await res.json()
    setHistoryLogsCache(prev => ({ ...prev, [memberId]: data.data || [] }))
  }

  // sync URL
  useEffect(() => {
    const p = new URLSearchParams()
    if (activeTab !== 'member') p.set('tab', activeTab)
    if (filterCampaign) p.set('campaign', filterCampaign)
    if (filterStatus)   p.set('status', filterStatus)
    if (activeTab === 'member' && filterRsvp) p.set('rsvp', filterRsvp)
    const qs = p.toString()
    router.replace(qs ? `/calling/pending?${qs}` : '/calling/pending', { scroll: false })
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
    setExpandedHistoryId(null)
    setHistoryLogsCache({})
    setHistoryItems([])
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
      fetchItems(activeTab, filterCampaign, filterStatus, filterRsvp)
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
          return (
            <button key={tab} onClick={() => switchTab(tab)}
              className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
                activeTab === tab
                  ? 'border-teal text-teal'
                  : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              {tab === 'member' ? 'Member' : 'Contact'}
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
          className={`px-4 py-2 text-base font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'history'
              ? 'border-teal text-teal'
              : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
          }`}>
          History
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
                {historyItems.map(item => {
                  const tier = item.tier || 'D'
                  const tierColor = TIER_COLORS[tier]
                  const isExpanded = expandedHistoryId === item.source_id
                  const logs = historyLogsCache[item.source_id]
                  return (
                    <div key={item.source_id}>
                      <button
                        onClick={() => handleHistoryExpand(item.source_id)}
                        className={`w-full text-left px-4 py-3 hover:bg-warm-50 dark:hover:bg-disc-hover transition ${isExpanded ? 'bg-warm-50 dark:bg-disc-hover' : ''}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 text-sm font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-medium text-warm-900 dark:text-disc-text">{item.full_name}</span>
                            </div>
                            <div className="text-sm text-warm-400 dark:text-disc-muted mt-0.5">
                              {item.latest_campaign_name && <span>{item.latest_campaign_name} · </span>}
                              {item.latest_called_at && new Date(item.latest_called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                              <span className="ml-1">({item.total_calls} ครั้ง)</span>
                            </div>
                            {item.latest_note && (
                              <div className="text-sm text-warm-600 dark:text-disc-text mt-0.5 italic truncate">"{item.latest_note}"</div>
                            )}
                          </div>
                          <span className="text-warm-400 dark:text-disc-muted text-lg flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 py-2 bg-warm-50 dark:bg-disc-hover border-t border-warm-200 dark:border-disc-border">
                          {item.mobile_number && (
                            <div className="mb-2">
                              <a href={`tel:${item.mobile_number}`} className="text-base text-teal font-medium">{item.mobile_number}</a>
                            </div>
                          )}
                          {logs === undefined ? (
                            <div className="text-sm text-warm-400 dark:text-disc-muted py-1">กำลังโหลด...</div>
                          ) : logs.length === 0 ? (
                            <div className="text-sm text-warm-400 dark:text-disc-muted py-1">ไม่มีประวัติ</div>
                          ) : (
                            <div className="space-y-1">
                              {logs.map(log => {
                                const logColor = CALL_STATUS_COLORS[log.status] || { bg: '#f3f4f6', text: '#6b7280', label: log.status }
                                const canEdit = log.called_by === effectiveDiscordId || isModerator
                                const isEditing = editingLogId === log.id
                                return (
                                  <div key={log.id} className="py-0.5">
                                    {!isEditing && (
                                      <div className="flex flex-wrap items-baseline gap-x-1.5">
                                        <span className="px-2 py-0.5 rounded text-sm font-semibold shrink-0" style={{ backgroundColor: logColor.bg, color: logColor.text }}>{logColor.label}</span>
                                        <span className="text-sm text-warm-800 dark:text-disc-text break-words">
                                          {log.note || ''}
                                          <span className="italic text-warm-400 dark:text-disc-muted">
                                            {(log.note && log.called_at) ? ' — ' : ''}
                                            {log.caller_name && <span>{log.caller_name} </span>}
                                            {log.called_at ? new Date(log.called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''}
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
                                            reloadHistoryLogs(item.source_id)
                                          }} className="p-0.5 rounded text-warm-400 hover:text-red-500 transition shrink-0">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {isEditing && (
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap gap-1.5">
                                          {EDIT_STATUS_OPTIONS.map(opt => (
                                            <button key={opt.value} type="button" onClick={() => setEditStatus(opt.value)}
                                              className="px-2.5 py-1 rounded text-sm border transition"
                                              style={editStatus === opt.value
                                                ? { backgroundColor: CALL_STATUS_COLORS[opt.value]?.bg, color: CALL_STATUS_COLORS[opt.value]?.text, borderColor: CALL_STATUS_COLORS[opt.value]?.text }
                                                : {}}>
                                              {opt.label}
                                            </button>
                                          ))}
                                        </div>
                                        <textarea rows={2} value={editNote} onChange={e => setEditNote(e.target.value)}
                                          className="w-full border dark:border-disc-border rounded px-2 py-1.5 text-sm bg-card-bg text-warm-900 dark:text-disc-text resize-none" />
                                        <div className="flex gap-2">
                                          <button onClick={async () => {
                                            await fetch('/api/calling/logs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ id: log.id, status: editStatus, note: editNote }) })
                                            setEditingLogId(null)
                                            reloadHistoryLogs(item.source_id)
                                          }} className="px-3 py-1 rounded text-sm bg-teal text-white hover:bg-teal/90 transition">บันทึก</button>
                                          <button onClick={() => setEditingLogId(null)} className="px-3 py-1 rounded text-sm text-warm-500 hover:bg-warm-100 dark:hover:bg-disc-hover transition">ยกเลิก</button>
                                        </div>
                                      </div>
                                    )}
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
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {activeTab !== 'history' && <div className="space-y-2 mb-5">
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

      {activeTab !== 'history' && !loading && total > 0 && (
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
      {activeTab !== 'history' && (loading ? (
        <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl py-16 text-center text-warm-400 dark:text-disc-muted text-base">
          {filterStatus === 'pending' ? 'โทรครบทุกคนแล้ว 🎉' : 'ไม่มีรายการ'}
        </div>
      ) : (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl overflow-hidden">
          {/* Table header — desktop only */}
          <div className="hidden sm:grid items-center px-4 py-2.5 gap-2 bg-warm-100 dark:bg-disc-header border-b border-warm-200 dark:border-disc-border text-sm font-medium text-warm-500 dark:text-disc-muted [grid-template-columns:1fr_40px_64px_88px]">
            <span>ชื่อ</span>
            <span className="text-center">ระดับ</span>
            <span className="text-center">รับสาย</span>
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
              const expiryBadge = isContact ? null : getExpiryBadge(item.expired_at)
              const catColor = isContact && item.category ? (CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other) : null

              return (
                <button
                  key={getItemKey(item)}
                  onClick={() => openModal(item)}
                  className="w-full text-left px-4 py-4 hover:bg-warm-50 dark:hover:bg-disc-hover transition group"
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
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text group-hover:text-teal transition-colors truncate">
                            {displayName}
                          </span>
                          {expiryBadge && <span className={`text-base font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                          {catColor && <span className="text-sm px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
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
                          const badge = getStatusBadge(item.call_status, item.latest_log_status)
                          return (
                            <div className="flex items-center gap-1">
                              {!isContact && item.rsvp && (
                                <span className="text-base font-bold" style={{ color: RSVP_ICONS[item.rsvp]?.color || '#666' }}>
                                  {RSVP_ICONS[item.rsvp]?.icon || item.rsvp}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded text-base font-medium whitespace-nowrap"
                                style={{ backgroundColor: badge.bg, color: badge.text }}>
                                {badge.label}
                              </span>
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
                  <div className="hidden sm:grid items-center [grid-template-columns:1fr_40px_64px_88px] gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text group-hover:text-teal transition-colors truncate">
                            {displayName}
                          </span>
                          {expiryBadge && <span className={`text-base font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                          {catColor && <span className="text-sm px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: catColor.bg, color: catColor.text }}>{CATEGORY_LABELS[item.category] || item.category}</span>}
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

                    <div className="flex justify-center">
                      <span
                        className="text-base font-semibold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
                      >{tier}</span>
                    </div>

                    <div className="text-center text-base text-warm-500 dark:text-disc-muted">
                      <span className="font-semibold text-warm-900 dark:text-disc-text">{item.answered_count}</span>
                      <span className="text-warm-300 dark:text-disc-muted/40">/</span>
                      <span>{item.total_calls}</span>
                    </div>

                    <div className="flex items-center gap-1 justify-end">
                      {(() => {
                        const badge = getStatusBadge(item.call_status, item.latest_log_status)
                        return (
                          <>
                            {!isContact && item.rsvp && (
                              <span className="text-base font-bold" style={{ color: RSVP_ICONS[item.rsvp]?.color || '#666' }}>
                                {RSVP_ICONS[item.rsvp]?.icon || item.rsvp}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded text-base font-medium whitespace-nowrap"
                              style={{ backgroundColor: badge.bg, color: badge.text }}>
                              {badge.label}
                            </span>
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
      ))}

      <RecordCallModal
        isOpen={!!modalItem}
        member={modalItem}
        contact_type={activeTab === 'contact' ? 'contact' : 'member'}
        onClose={closeModal}
        onSave={handleSave}
        onSaveAndNext={handleSaveAndNext}
        hasNext={hasNext}
      />

      {pdpaKey && <PdpaAgreementModal storageKey={pdpaKey} />}
    </div>
  )
}
