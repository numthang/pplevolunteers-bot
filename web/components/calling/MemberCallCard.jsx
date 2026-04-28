'use client'

import Link from 'next/link'

const TIER_CLS = {
  A: 'bg-[#ead3ce] text-[#714b2b] dark:bg-[#3d2318] dark:text-[#d4a48a]',
  B: 'bg-[#cce5f4] text-[#0c447c] dark:bg-[#0c2640] dark:text-[#7bbfec]',
  C: 'bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e]',
  D: 'bg-[#fcebeb] text-[#a32d2d] dark:bg-[#3a1212] dark:text-[#d47373]',
}

export default function MemberCallCard({ campaignId, member, assignment, stats }) {
  const tier = member.tier || 'D'
  const tierCls = TIER_CLS[tier] || TIER_CLS.D

  const lastCallDate = stats?.last_called_at
    ? new Date(stats.last_called_at).toLocaleDateString('th-TH')
    : null

  const answeredRate = stats?.total_calls
    ? `${stats.answered_count}/${stats.total_calls}`
    : null

  return (
    <Link href={`/calling/${campaignId}/${member.source_id}`}>
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-4 hover:border-teal dark:hover:border-teal hover:shadow-sm transition cursor-pointer group">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-base text-warm-900 dark:text-warm-50 truncate group-hover:text-teal transition-colors">
              {member.full_name}
            </h3>
            <p className="text-sm text-warm-400 dark:text-warm-dark-400 mt-0.5">{member.home_amphure}</p>
          </div>
          <span className={`text-sm font-semibold px-2 py-0.5 rounded-md flex-shrink-0 ${tierCls}`}>
            {tier}
          </span>
        </div>

        {lastCallDate ? (
          <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-2">
            โทรล่าสุด: {lastCallDate}
            {stats?.last_note && ` — "${stats.last_note}"`}
          </p>
        ) : (
          <p className="text-sm text-warm-400 dark:text-warm-dark-400 mb-2">ยังไม่มีประวัติการโทร</p>
        )}

        {answeredRate && (
          <p className="text-sm text-warm-400 dark:text-warm-dark-400 mb-3">รับสาย {answeredRate} ครั้ง</p>
        )}

        {assignment?.assigned_to ? (
          <p className="text-sm text-teal bg-teal-light dark:bg-teal-dim dark:text-teal-bright px-2 py-1 rounded-md truncate">
            → {assignment.assigned_to}
          </p>
        ) : (
          <p className="text-sm text-warm-400 dark:text-warm-dark-400 bg-warm-100 dark:bg-warm-dark-200 px-2 py-1 rounded-md">
            ยังไม่มอบหมาย
          </p>
        )}
      </div>
    </Link>
  )
}
