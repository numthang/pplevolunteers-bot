'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useEffectiveRoles } from '@/lib/useEffectiveRoles.js'
import { CALL_STATUS_COLORS } from '@/lib/callingStatusColors.js'
import { SIGNALS, SIGNAL_OPTIONS, findSignalLabel } from '@/lib/callingSignals.js'
import SmsModal from '@/components/calling/SmsModal.jsx'

const MODERATOR_ROLES = ['Admin', 'เลขาธิการ', 'Moderator']

const CALL_STATUS_OPTIONS = [
  { value: 'answered',   label: 'รับสาย', icon: '📞', color: '#0d9e94', bg: '#e1f5f4' },
  { value: 'no_answer',  label: 'ไม่รับ',  icon: '📵', color: '#854f0b', bg: '#faeeda' },
  { value: 'not_called', label: 'ไม่ได้โทร', icon: '📝', color: '#6b7280', bg: '#f3f4f6' },
]

const NOTE_PLACEHOLDER = {
  answered:   'เช่น ทำงานอยู่กรุงเทพ กลับบ้านเดือนละครั้ง',
  no_answer:  'เช่น สายไม่ว่าง / ปิดเครื่อง / เบอร์ผิด / ฝากข้อความ',
  not_called: 'เช่น บันทึกข้อมูลสมาชิก / ติดต่อ LINE แล้ว / เบอร์ผิด / คาดว่าไม่สะดวก',
  met:        'เช่น เจอที่งาน event ราชบุรี / นัดเจอที่ร้านกาแฟ',
}

const RSVP_OPTIONS = [
  { value: 'yes',   label: 'ร่วม',    icon: '✓', activeClass: 'bg-teal border-teal text-white' },
  { value: 'no',    label: 'ไม่ร่วม', icon: '✗', activeClass: 'bg-[#fcebeb] border-[#a32d2d] text-[#a32d2d]' },
  { value: 'maybe', label: 'อาจจะ',   icon: '?', activeClass: 'bg-[#faeeda] border-[#854f0b] text-[#854f0b]' },
]

const getLogStatusStyle = (status) => {
  const color = CALL_STATUS_COLORS[status]
  return color ? { bg: color.bg, text: color.text, label: color.label } : { bg: '#f3f4f6', text: '#6b7280', label: status }
}

function getExpiryBadge(expiredAt) {
  if (!expiredAt) return null
  const now = Date.now()
  const exp = new Date(expiredAt).getTime()
  if (exp < now) return { label: 'หมดอายุ', cls: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400' }
  if (exp - now < 90 * 24 * 60 * 60 * 1000) return { label: 'ใกล้หมด', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' }
  return null
}

const TIER_COLORS = {
  A: { bg: '#ead3ce', text: '#714b2b' },
  B: { bg: '#cce5f4', text: '#0c447c' },
  C: { bg: '#faeeda', text: '#854f0b' },
  D: { bg: '#fcebeb', text: '#a32d2d' },
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

function ExpandableText({ text, clamp = 'line-clamp-2', className = '' }) {
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
    <div className="flex items-baseline gap-1">
      <p ref={ref} className={`${className} ${expanded ? 'whitespace-pre-wrap' : clamp}`}>
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

function CampaignActions({ campaignName, description, onSmsClick }) {
  const [copied, setCopied] = useState(false)
  const copyText = description || campaignName || ''

  async function copy() {
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-3 shrink-0">
      <button onClick={copy} className="flex items-center gap-1 text-base text-teal hover:underline" title="คัดลอก">
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
        {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
      </button>
      <button onClick={onSmsClick} className="flex items-center gap-1 text-base text-teal hover:underline" title="ส่ง SMS">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        SMS
      </button>
      <a href={`https://line.me/R/share?text=${encodeURIComponent(copyText)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-base text-teal hover:underline" title="ส่ง LINE">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
        LINE
      </a>
    </div>
  )
}

function SignalScoreLabel({ signalKey, value }) {
  const label = findSignalLabel(signalKey, value)
  if (!label) return <span className="text-warm-400">—</span>
  return <span>{label}</span>
}

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function formatEventDate(dateStr) {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${day} ${THAI_MONTHS[month - 1]} ${year + 543}`
}

export default function RecordCallModal({ isOpen, member, contact_type = 'member', onClose, onSave, onSaveAndNext, hasNext }) {
  const { data: session } = useSession()
  const { roles: effectiveRoles, discordId: effectiveDiscordId } = useEffectiveRoles(session)
  const isModerator = MODERATOR_ROLES.some(r => effectiveRoles.includes(r))

  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [rsvp, setRsvp] = useState('')
  const [note, setNote] = useState('')
  const [signals, setSignals] = useState({})
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingLogId, setEditingLogId] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  const [editNote, setEditNote] = useState('')

  const memberId = member?.source_id || member?.id
  const isContact = contact_type === 'contact'

  const loadHistory = useCallback(() => {
    if (!memberId) return
    setHistoryLoading(true)
    const ctParam = isContact ? '&contactType=contact' : ''
    fetch(`/api/calling/logs?memberId=${memberId}${ctParam}`)
      .then(r => r.json())
      .then(d => setHistory(d.data || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [memberId, isContact])

  useEffect(() => {
    setStatus('')
    setRsvp('')
    setNote('')
    setSignals({})
    setSaving(false)
    setEditingLogId(null)
    if (isOpen && memberId) loadHistory()
  }, [memberId, isOpen])

  const computeOverall = useCallback(() => {
    const vals = SIGNALS.map(s => signals[s.key]).filter(Boolean)
    if (!vals.length) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }, [signals])

  const signalsApply = status === 'answered' || status === 'met'

  const buildPayload = useCallback(() => ({
    campaign_id: member?.campaign_id || 0,
    member_id: memberId,
    contact_type,
    status,
    sig_overall: signalsApply ? computeOverall() : null,
    sig_location:     signalsApply ? (signals.sig_location || null) : null,
    sig_availability: signalsApply ? (signals.sig_availability || null) : null,
    sig_interest:     signalsApply ? (signals.sig_interest || null) : null,
    sig_reachable:    null,
    note: note.trim() || null,
    rsvp: (!isContact && status === 'answered') ? (rsvp || null) : null,
  }), [member, memberId, contact_type, isContact, status, rsvp, signals, note, computeOverall, signalsApply])

  const handleSave = async (goNext = false) => {
    if (!status) return
    setSaving(true)
    try {
      if (goNext) await onSaveAndNext(buildPayload())
      else await onSave(buildPayload())
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !member) return null

  const smsModal = (
    <SmsModal
      isOpen={smsModalOpen}
      count={1}
      campaignId={member.campaign_id || 0}
      contactType={contact_type}
      memberIds={[memberId]}
      defaultMessage={member.campaign_description || ''}
      onClose={() => setSmsModalOpen(false)}
      onDone={() => { setSmsModalOpen(false); loadHistory() }}
    />
  )

  const tier = member.tier || 'D'
  const tierColor = TIER_COLORS[tier]
  const displayName = member.full_name || [member.first_name, member.last_name].filter(Boolean).join(' ') || '?'
  const avatarChar = displayName[0] || '?'
  const phone = member.mobile_number || member.phone
  const locationStr = [
    member.home_district || member.tambon,
    member.home_amphure || member.amphoe,
    member.home_province || member.province,
  ].filter(Boolean).join(' · ')
  const expiryBadge = isContact ? null : getExpiryBadge(member.expired_at)
  const showSignals = signalsApply
  const signalsFilled = SIGNALS.some(s => signals[s.key])
  const canSave = status && note.trim() && (!signalsApply || signalsFilled) && (status !== 'answered' || isContact || rsvp)

  return (
    <>
    <div
      className="fixed inset-0 z-50 overflow-y-auto flex items-start sm:items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-warm-dark-100 rounded-xl w-full max-w-3xl shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-warm-200 dark:border-warm-dark-300">
          <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-50">บันทึกการโทร</h2>
          <button
            onClick={onClose}
            className="text-warm-400 hover:text-warm-700 dark:hover:text-warm-200 text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
          >×</button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col md:grid md:grid-cols-2 gap-5">

          {/* SIDEBAR */}
          <div className="md:order-2 bg-warm-50 dark:bg-warm-dark-200 rounded-lg p-4 flex flex-col gap-4">

            {/* Name + tier */}
            <div className="flex items-center gap-3 pb-4 border-b border-warm-200 dark:border-warm-dark-300">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-base font-semibold flex-shrink-0"
                style={{ backgroundColor: tierColor.bg, color: tierColor.text }}
              >
                {avatarChar}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-lg text-warm-900 dark:text-warm-50 truncate">{displayName}</span>
                  <span className="text-base font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: tierColor.bg, color: tierColor.text }}>{tier}</span>
                  {expiryBadge && <span className={`text-base font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${expiryBadge.cls}`}>{expiryBadge.label}</span>}
                  {member.source_id && <span className="text-base text-warm-300 dark:text-warm-dark-500 flex-shrink-0">#{member.source_id}</span>}
                </div>
                <div className="text-base text-warm-400 dark:text-warm-dark-400 truncate mt-0.5">
                  {locationStr || '—'}
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-2">
              <div className="flex gap-2">
                {phone ? (
                  <a
                    href={`tel:${phone}`}
                    className="flex items-center justify-center gap-2 flex-1 py-3 rounded-lg font-semibold text-base transition hover:opacity-90"
                    style={{ backgroundColor: '#0d9e94', color: '#fff' }}
                  >
                    <span>📞</span>
                    <span>{phone}</span>
                  </a>
                ) : (
                  <div className="flex items-center justify-center flex-1 py-3 rounded-lg text-base border border-dashed border-warm-300 dark:border-warm-dark-300 text-warm-400 dark:text-warm-dark-400">
                    ไม่มีเบอร์โทร
                  </div>
                )}

                {member.discord_id && (
                  <a
                    href={`https://discord.com/users/${member.discord_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center px-3 py-3 rounded-lg transition hover:opacity-90"
                    style={{ backgroundColor: '#5865F2' }}
                    title={member.discord_username || member.discord_id}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.033.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  </a>
                )}

                {member.line_id && (
                  <a
                    href={`line://ti/p/~${member.line_id}`}
                    className="flex items-center justify-center px-3 py-3 rounded-lg transition hover:opacity-90"
                    style={{ backgroundColor: '#06C755' }}
                    title={member.line_id}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                    </svg>
                  </a>
                )}
              </div>

              {(member.email || member.facebook_id) && (
                <div className="text-base space-y-1.5 pt-1">
                  {member.email && (
                    <a href={`mailto:${member.email}`} className="flex items-center gap-2 text-warm-500 dark:text-warm-dark-400 hover:text-teal truncate">
                      <span>✉️</span>
                      <span className="truncate">{member.email}</span>
                    </a>
                  )}
                  {member.facebook_id && (
                    <a
                      href={`https://facebook.com/${member.facebook_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-warm-500 dark:text-warm-dark-400 hover:text-blue-500 truncate"
                    >
                      <span>📘</span>
                      <span className="truncate">{member.facebook_id}</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Call History */}
            <div>
              <div className="text-base font-semibold text-warm-500 dark:text-warm-dark-400 mb-2">
                ประวัติ{history.length > 0 && (
                  <span className="font-normal ml-1">
                    ({history.filter(l => l.status === 'answered').length}/{history.length} รับ)
                  </span>
                )}
              </div>
              {historyLoading ? (
                <div className="text-base text-warm-400 dark:text-warm-dark-400">โหลด...</div>
              ) : history.length === 0 ? (
                <div className="text-base text-warm-400 dark:text-warm-dark-400">ยังไม่มี</div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {history.map(log => {
                    const s = getLogStatusStyle(log.status)
                    const canEdit = log.called_by === effectiveDiscordId || isModerator
                    const isEditing = editingLogId === log.id
                    return (
                      <div key={log.id} className="rounded-lg p-3 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300">
                        {!isEditing && (
                          <div className="flex items-start gap-2">
                            <div className="flex-1 flex flex-wrap items-baseline gap-x-1.5">
                              <span className="px-2 py-0.5 rounded text-base font-semibold shrink-0" style={{ backgroundColor: s.bg, color: s.text }}>{s.label}</span>
                              <span className="text-base text-warm-800 dark:text-warm-100 break-words">
                                {log.note ? parseLinks(log.note) : null}
                                <span className="italic text-warm-400 dark:text-warm-dark-500">
                                  {(log.note && (log.caller_name || log.called_at)) ? ' — ' : ''}
                                  {log.caller_name && (
                                    <a href={`https://discord.com/users/${log.called_by}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{log.caller_name}</a>
                                  )}
                                  {log.caller_name && log.called_at ? ' ' : ''}
                                  {log.called_at ? new Date(log.called_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : null}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {canEdit && (
                                <button onClick={() => { setEditingLogId(log.id); setEditStatus(log.status); setEditNote(log.note || '') }}
                                  className="p-1 rounded text-warm-400 hover:text-teal hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                              )}
                              {isModerator && (
                                <button onClick={async () => {
                                  if (!confirm('ลบ log นี้?')) return
                                  await fetch(`/api/calling/logs?id=${log.id}`, { method: 'DELETE' })
                                  loadHistory()
                                }} className="p-1 rounded text-warm-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {isEditing ? (
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                              {CALL_STATUS_OPTIONS.map(opt => (
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
                                loadHistory()
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
          </div>

          {/* MAIN FORM */}
          <div className="md:order-1 flex flex-col gap-4">

            {/* Campaign info */}
            <div className="bg-white dark:bg-warm-dark-100 rounded-lg p-3 border border-warm-200 dark:border-warm-dark-300 space-y-2 overflow-hidden">
              <CampaignActions campaignName={member.campaign_name} description={member.campaign_description} onSmsClick={() => setSmsModalOpen(true)} />
              <div className="text-base font-semibold text-warm-900 dark:text-warm-50">{member.campaign_name || '—'}</div>
              {member.campaign_description && (
                <p className="text-base text-warm-700 dark:text-warm-200 whitespace-pre-wrap break-all">{parseLinks(member.campaign_description)}</p>
              )}
              {member.event_date && (
                <div className="text-base text-warm-700 dark:text-warm-200">
                  วันที่กิจกรรม : <span className="font-semibold text-orange-600 dark:text-orange-400">{formatEventDate(member.event_date)}</span>
                </div>
              )}
            </div>

            {/* Call guide */}
            <div className="px-1 text-base text-warm-600 dark:text-warm-300 leading-snug">
              <span className="font-semibold text-orange-600 dark:text-orange-400">หัวข้อสนทนา</span>
              {' · '}อยู่ในพื้นที่ไหม
              {' · '}วันสะดวกร่วมกิจกรรม
              {' · '}สนใจเข้าร่วมขนาดไหน
              {' · '}ส่งลิงก์ ACT ทาง SMS หรือไลน์
            </div>

            {/* Status */}
            <div>
              <div className="text-base font-semibold text-warm-700 dark:text-warm-200 mb-2">สถานะการโทร *</div>
              <div className="grid grid-cols-3 gap-2">
                {CALL_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setStatus(opt.value); if (opt.value === 'no_answer' && !note.trim()) setNote('ไม่รับสาย') }}
                    className={`py-4 px-2 text-xl rounded-xl border-2 transition font-medium flex flex-col items-center gap-1.5 ${
                      status === opt.value
                        ? ''
                        : 'border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
                    }`}
                    style={status === opt.value
                      ? { backgroundColor: opt.bg, borderColor: opt.color, color: opt.color }
                      : {}
                    }
                  >
                    <span className="text-2xl leading-none">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <div className="text-base font-semibold text-warm-700 dark:text-warm-200 mb-2">บันทึก *</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder={NOTE_PLACEHOLDER[status] || 'บันทึกเพิ่มเติม'}
                className="w-full px-3 py-2.5 text-base border-2 border-teal bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 placeholder-warm-400 dark:placeholder-warm-dark-400 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-teal"
              />
            </div>

            {/* RSVP — members only */}
            {!isContact && status === 'answered' && (
              <div>
                <div className="text-base font-semibold text-warm-700 dark:text-warm-200 mb-2">เข้าร่วมกิจกรรมได้ไหม *</div>
                <div className="grid grid-cols-3 gap-2">
                  {RSVP_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRsvp(opt.value)}
                      className={`py-2.5 px-2 text-base rounded-lg border-2 transition font-medium flex items-center justify-center gap-1.5 ${
                        rsvp === opt.value
                          ? opt.activeClass
                          : 'bg-warm-100 dark:bg-warm-dark-200 border-warm-300 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:border-teal hover:text-teal'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Signals */}
            {showSignals && (
              <div className="bg-warm-50 dark:bg-warm-dark-200 rounded-lg p-4 space-y-4">
                {SIGNALS.map(sig => (
                  <div key={sig.key}>
                    <div className="mb-2 text-base font-semibold text-warm-700 dark:text-warm-200">{sig.label}</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {SIGNAL_OPTIONS.map(opt => {
                        const active = signals[sig.key] === opt.value
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setSignals(prev => ({ ...prev, [sig.key]: opt.value }))}
                            className={`py-2 px-1 rounded-md border transition text-center flex flex-col items-center gap-0.5 ${
                              active
                                ? 'bg-teal border-teal text-white'
                                : 'border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 bg-white dark:bg-warm-dark-100 hover:border-teal hover:text-teal'
                            }`}
                          >
                            <span className="text-base font-medium">{sig.hints[opt.value]}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-2 border-t border-warm-200 dark:border-warm-dark-300">
              {hasNext && (
                <button
                  onClick={() => handleSave(true)}
                  disabled={!canSave || saving}
                  className="flex-1 py-3 bg-teal hover:opacity-90 disabled:opacity-40 text-white text-base font-semibold rounded-lg transition"
                >
                  {saving ? '...' : 'บันทึก & ต่อ'}
                </button>
              )}
              <button
                onClick={() => handleSave(false)}
                disabled={!canSave || saving}
                className={`py-3 text-base font-semibold rounded-lg border transition disabled:opacity-40 ${
                  hasNext
                    ? 'px-4 border-warm-200 dark:border-warm-dark-300 text-warm-700 dark:text-warm-200 hover:bg-warm-50 dark:hover:bg-warm-dark-200'
                    : 'flex-1 bg-teal hover:opacity-90 text-white border-teal'
                }`}
              >
                {saving ? '...' : 'บันทึก'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 text-base text-warm-500 dark:text-warm-dark-500 hover:text-warm-700 dark:hover:text-warm-200 rounded-lg hover:bg-warm-100 dark:hover:bg-warm-dark-200 transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    {smsModal}
    </>
  )
}
