'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import CallLogger from '@/components/calling/CallLogger.jsx'

const TIER_CLS = {
  A: 'bg-[#ead3ce] text-[#714b2b] dark:bg-[#3d2318] dark:text-[#d4a48a]',
  B: 'bg-[#cce5f4] text-[#0c447c] dark:bg-[#0c2640] dark:text-[#7bbfec]',
  C: 'bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e]',
  D: 'bg-[#fcebeb] text-[#a32d2d] dark:bg-[#3a1212] dark:text-[#d47373]',
}

const STATUS_LABEL = {
  answered:     { label: 'รับสาย',   cls: 'bg-teal-light text-teal dark:bg-teal-dim dark:text-teal-bright' },
  no_answer:    { label: 'ไม่รับ',   cls: 'bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e]' },
  wrong_number: { label: 'เบอร์ผิด', cls: 'bg-[#fcebeb] text-[#a32d2d] dark:bg-[#3a1212] dark:text-[#d47373]' },
  busy:         { label: 'สายไม่ว่าง (เก่า)', cls: 'bg-warm-100 text-warm-500 dark:bg-warm-dark-200 dark:text-warm-dark-500' },
}

export default function CallPage({ params }) {
  const { campaignId, memberId } = use(params)
  const [member, setMember] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [logs, setLogs] = useState([])
  const [tier, setTier] = useState(null)
  const [stats, setStats] = useState(null)
  const [assignment, setAssignment] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [campaignId, memberId])

  const fetchData = async () => {
    try {
      const [memberRes, logsRes, tierRes, campaignRes, assignmentRes] = await Promise.all([
        fetch(`/api/calling/members?search=${memberId}&limit=1`),
        fetch(`/api/calling/logs?campaignId=${campaignId}&memberId=${memberId}`),
        fetch(`/api/calling/tiers?memberId=${memberId}`),
        fetch('/api/calling/campaigns'),
        fetch(`/api/calling/assignments?campaignId=${campaignId}&memberId=${memberId}`),
      ])

      const [memberData, logsData, tierData, campaignData, assignmentData] = await Promise.all([
        memberRes.json(), logsRes.json(), tierRes.json(), campaignRes.json(), assignmentRes.json()
      ])

      if (memberData.data?.[0]) setMember(memberData.data[0])
      if (tierData.data) setTier(tierData.data)
      if (assignmentData.data) setAssignment(assignmentData.data)

      const camp = campaignData.data?.find(c => c.id === parseInt(campaignId))
      if (camp) setCampaign(camp)

      if (logsData.data) {
        setLogs(logsData.data)
        const answered = logsData.data.filter(l => l.status === 'answered')
        setStats({
          total: logsData.data.length,
          answered: answered.length,
          avgScore: answered.length > 0
            ? (answered.reduce((sum, l) => sum + (l.sig_overall || 0), 0) / answered.length).toFixed(1)
            : null
        })
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRsvp = async (value) => {
    const newRsvp = assignment?.rsvp === value ? null : value
    try {
      const res = await fetch('/api/calling/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: parseInt(campaignId), member_id: parseInt(memberId), rsvp: newRsvp })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setAssignment(data.data)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-sm">กำลังโหลด...</div>
  }

  if (!member) {
    return <div className="py-20 text-center text-red-500 text-sm">ไม่พบข้อมูลสมาชิก</div>
  }

  const currentTier = tier?.tier || member.tier || 'D'
  const tierCls = TIER_CLS[currentTier] || TIER_CLS.D

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-warm-500 dark:text-warm-dark-500">
        <Link href="/calling" className="text-teal hover:underline">แคมเปญ</Link>
        <span className="mx-2">›</span>
        {campaign && (
          <>
            <Link href={`/calling/${campaignId}`} className="text-teal hover:underline">{campaign.name}</Link>
            <span className="mx-2">›</span>
          </>
        )}
        <span className="text-warm-900 dark:text-warm-50">{member.full_name}</span>
      </div>

      {/* Member Info Card */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-xl font-medium text-warm-900 dark:text-warm-50 mb-1">{member.full_name}</h1>
            <p className="text-sm text-warm-500 dark:text-warm-dark-500">
              {[member.home_amphure, member.home_province].filter(Boolean).join(', ')}
            </p>
          </div>
          <span className={`text-2xl font-bold px-4 py-2 rounded-xl ${tierCls}`}>{currentTier}</span>
        </div>

        {/* Contact */}
        <div className="flex flex-wrap gap-6 mb-5">
          {member.mobile_number && (
            <div>
              <p className="text-xs text-warm-500 dark:text-warm-dark-500 mb-0.5">เบอร์โทร</p>
              <a href={`tel:${member.mobile_number}`} className="text-teal hover:underline text-sm font-medium">
                {member.mobile_number}
              </a>
            </div>
          )}
          {member.line_username && (
            <div>
              <p className="text-xs text-warm-500 dark:text-warm-dark-500 mb-0.5">LINE</p>
              <p className="text-sm text-warm-900 dark:text-warm-50">{member.line_username}</p>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-warm-100 dark:bg-warm-dark-200 p-3 rounded-lg text-center">
            <p className="text-xs text-warm-500 dark:text-warm-dark-500 mb-1">โทรทั้งหมด</p>
            <p className="text-2xl font-semibold text-warm-900 dark:text-warm-50">{stats?.total || 0}</p>
          </div>
          <div className="bg-teal-light dark:bg-teal-dim p-3 rounded-lg text-center">
            <p className="text-xs text-teal dark:text-teal-bright mb-1">รับสาย</p>
            <p className="text-2xl font-semibold text-teal dark:text-teal-bright">{stats?.answered || 0}</p>
          </div>
          <div className="bg-warm-100 dark:bg-warm-dark-200 p-3 rounded-lg text-center">
            <p className="text-xs text-warm-500 dark:text-warm-dark-500 mb-1">คะแนนเฉลี่ย</p>
            <p className="text-2xl font-semibold text-warm-900 dark:text-warm-50">{stats?.avgScore || '—'}</p>
          </div>
        </div>

        {/* RSVP — only if assigned */}
        {assignment && (
          <div>
            <p className="text-xs font-medium text-warm-500 dark:text-warm-dark-500 mb-2">ร่วมกิจกรรม</p>
            <div className="flex gap-2">
              {[
                { value: 'yes',   label: 'เข้าร่วม',    active: 'bg-teal text-white border-teal' },
                { value: 'no',    label: 'ไม่เข้าร่วม', active: 'bg-[#fcebeb] text-[#a32d2d] border-[#a32d2d]' },
                { value: 'maybe', label: 'อาจจะ',        active: 'bg-[#faeeda] text-[#854f0b] border-[#854f0b]' },
              ].map(opt => (
                <button key={opt.value} type="button" onClick={() => handleRsvp(opt.value)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition ${
                    assignment.rsvp === opt.value
                      ? opt.active
                      : 'bg-white dark:bg-warm-dark-200 text-warm-500 dark:text-warm-dark-500 border-warm-200 dark:border-warm-dark-300 hover:border-teal'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Call Logger */}
        <div className="lg:col-span-2">
          <CallLogger campaignId={campaignId} memberId={memberId} onLogComplete={fetchData} />
        </div>

        {/* Call History */}
        <div className="lg:col-span-3">
          <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-6">
            <h3 className="text-base font-medium text-warm-900 dark:text-warm-50 mb-4">ประวัติการโทร</h3>

            {logs.length === 0 ? (
              <p className="text-warm-400 dark:text-warm-dark-400 text-sm text-center py-8">ยังไม่มีประวัติการโทร</p>
            ) : (
              <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
                {logs.map(log => {
                  const s = STATUS_LABEL[log.status] || { label: log.status, cls: '' }
                  return (
                    <div key={log.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-warm-900 dark:text-warm-50">
                            {new Date(log.called_at).toLocaleString('th-TH')}
                          </p>
                          {log.caller_name && (
                            <p className="text-xs text-warm-400 dark:text-warm-dark-400">
                              โดย{' '}
                              <a
                                href={`https://discord.com/users/${log.called_by}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-teal hover:underline"
                              >
                                {log.caller_name}
                              </a>
                            </p>
                          )}
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-md ${s.cls}`}>{s.label}</span>
                      </div>

                      {log.sig_overall && (
                        <p className="text-xs text-teal font-semibold mb-1">คะแนน: {log.sig_overall}</p>
                      )}

                      {log.note && (
                        <p className="text-sm text-warm-700 dark:text-warm-200 bg-warm-50 dark:bg-warm-dark-200 px-3 py-2 rounded-lg">
                          {log.note}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
