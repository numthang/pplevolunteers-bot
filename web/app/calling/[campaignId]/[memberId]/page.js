'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import CallLogger from '@/components/calling/CallLogger.jsx'

export default function CallPage({ params }) {
  const { campaignId, memberId } = use(params)
  const [member, setMember] = useState(null)
  const [logs, setLogs] = useState([])
  const [tier, setTier] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [campaignId, memberId])

  const fetchData = async () => {
    try {
      const memberRes = await fetch(`/api/calling/members?search=${memberId}&limit=1`)
      const memberData = await memberRes.json()
      if (memberData.data?.[0]) setMember(memberData.data[0])

      const logsRes = await fetch(`/api/calling/logs?campaignId=${campaignId}&memberId=${memberId}`)
      const logsData = await logsRes.json()
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

      const tierRes = await fetch(`/api/calling/tiers?memberId=${memberId}`)
      const tierData = await tierRes.json()
      if (tierData.data) setTier(tierData.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
  }

  if (!member) {
    return <div className="p-8 text-center text-red-600 dark:text-red-400">ไม่พบข้อมูลสมาชิก</div>
  }

  return (
    <div>
      <Link href={`/calling/${campaignId}`} className="text-indigo-600 dark:text-indigo-400 hover:underline mb-4 block text-sm">
        ← กลับไปหน้าแคมเปญ
      </Link>

      {/* Member Info */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{member.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{member.district}, {member.province}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">ระดับปัจจุบัน</p>
            <p className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{tier?.tier || 'D'}</p>
          </div>
        </div>

        {/* Contact Info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          {member.phone && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">เบอร์โทร</p>
              <a href={`tel:${member.phone}`} className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">
                {member.phone}
              </a>
            </div>
          )}
          {member.line_username && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">LINE</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{member.line_username}</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">โทรทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats?.total || 0}</p>
          </div>
          <div className="bg-green-100 dark:bg-green-900/40 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">รับสาย</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats?.answered || 0}</p>
          </div>
          <div className="bg-indigo-100 dark:bg-indigo-900/40 p-3 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">คะแนนเฉลี่ย</p>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">{stats?.avgScore || '-'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Logger Form */}
        <div className="lg:col-span-1">
          <CallLogger campaignId={campaignId} memberId={memberId} onLogComplete={fetchData} />
        </div>

        {/* Call History */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
            <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">ประวัติการโทร</h3>

            {logs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">ยังไม่มีประวัติการโทร</p>
            ) : (
              <div className="space-y-4">
                {logs.map(log => (
                  <div key={log.id} className="border-b border-gray-100 dark:border-gray-700 pb-4 last:border-b-0">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                          {new Date(log.called_at).toLocaleString('th-TH')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">โดย: {log.caller_name}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        log.status === 'answered'
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                      }`}>
                        {log.status === 'answered' ? 'รับสาย' : 'ไม่รับสาย'}
                      </span>
                    </div>

                    {log.sig_overall && (
                      <p className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-2">
                        คะแนน: {log.sig_overall}
                      </p>
                    )}

                    {log.note && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                        {log.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
