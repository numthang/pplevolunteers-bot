'use client'

import Link from 'next/link'

const TIER_COLORS = {
  A: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
  B: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
  C: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300',
  D: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300',
}

export default function MemberCallCard({ campaignId, member, assignment, stats }) {
  const tierColor = TIER_COLORS[member.tier] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'

  const lastCallDate = stats?.last_called_at
    ? new Date(stats.last_called_at).toLocaleDateString('th-TH')
    : 'ยังไม่โทร'

  const answeredRate = stats?.total_calls
    ? `${stats.answered_count}/${stats.total_calls}`
    : '0/0'

  return (
    <Link href={`/calling/${campaignId}/${member.member_id}`}>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition cursor-pointer">
        {/* Header: Name + Tier + District */}
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base text-gray-900 dark:text-gray-100 truncate">{member.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{member.district}</p>
          </div>
          <span className={`ml-2 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${tierColor}`}>
            {member.tier || 'D'}
          </span>
        </div>

        {/* Last call info */}
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          โทรล่าสุด: {lastCallDate}
          {stats?.last_note && ` — "${stats.last_note}"`}
        </p>

        {/* Call stats */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          รับสาย {answeredRate} ครั้ง
        </p>

        {/* Assignment status */}
        {assignment?.assigned_to ? (
          <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded">
            มอบหมายให้: {assignment.assigned_to}
          </p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
            ยังไม่มีการมอบหมาย
          </p>
        )}
      </div>
    </Link>
  )
}
