'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'

const PAGE_SIZE = 50

const TIER_CLS = {
  A: 'bg-[#ead3ce] text-[#714b2b] dark:bg-[#3d2318] dark:text-[#d4a48a]',
  B: 'bg-[#cce5f4] text-[#0c447c] dark:bg-[#0c2640] dark:text-[#7bbfec]',
  C: 'bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e]',
  D: 'bg-[#fcebeb] text-[#a32d2d] dark:bg-[#3a1212] dark:text-[#d47373]',
}

const selectCls = 'h-9 px-2.5 text-sm border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal'
const inputCls = 'h-9 px-2.5 text-sm w-full border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 placeholder-warm-400 dark:placeholder-warm-dark-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal'

export default function MembersPage() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/calling/members?limit=500')
      const data = await res.json()
      if (data.data) setMembers(data.data)
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredMembers = members.filter(m => {
    if (searchKeyword && !m.full_name?.toLowerCase().includes(searchKeyword.toLowerCase())) return false
    if (filterTier && (m.tier || 'D') !== filterTier) return false
    return true
  })

  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMembers.length

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchKeyword, filterTier])

  const handleObserver = useCallback((entries) => {
    if (entries[0].isIntersecting && hasMore) {
      setVisibleCount(c => c + PAGE_SIZE)
    }
  }, [hasMore])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleObserver])

  if (loading) {
    return (
      <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-sm">
        กำลังโหลด...
      </div>
    )
  }

  const tiers = ['A', 'B', 'C', 'D']

  return (
    <div>
      {/* Breadcrumb & Header */}
      <div className="mb-6 text-sm text-warm-500 dark:text-warm-dark-500">
        <Link href="/calling" className="text-teal hover:underline">แคมเปญ</Link>
        <span className="mx-2">›</span>
        <span className="text-warm-900 dark:text-warm-50">รายชื่อสมาชิก</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-medium text-warm-900 dark:text-warm-50 mb-1">รายชื่อสมาชิก</h1>
        <p className="text-sm text-warm-500 dark:text-warm-dark-500">
          สมาชิกทั้งหมดที่คุณมี rights ในการโทร
        </p>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-40">
          <label className="block text-xs font-medium text-warm-500 dark:text-warm-dark-500 mb-1">ค้นหาชื่อ</label>
          <input
            type="text"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            placeholder="ชื่อสมาชิก"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-500 dark:text-warm-dark-500 mb-1">ระดับ</label>
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={selectCls}>
            <option value="">ทั้งหมด</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-3 bg-warm-100 dark:bg-warm-dark-200 border-b border-warm-200 dark:border-warm-dark-300 text-sm">
          <span className="text-warm-700 dark:text-warm-50 font-medium flex-1">
            สมาชิก {filteredMembers.length > 0 && `(${filteredMembers.length})`}
          </span>
          <span className="hidden sm:block text-warm-500 dark:text-warm-dark-500 w-28">อำเภอ</span>
          <span className="hidden md:block text-warm-500 dark:text-warm-dark-500 w-20">การโทร</span>
          <span className="text-warm-500 dark:text-warm-dark-500 w-10 text-center">ระดับ</span>
        </div>

        {/* Member rows */}
        <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
          {visibleMembers.length === 0 ? (
            <div className="px-6 py-8 text-center text-warm-400 dark:text-warm-dark-400 text-sm">
              ไม่พบสมาชิก
            </div>
          ) : (
            visibleMembers.map(member => {
              const tier = member.tier || 'D'
              const tierCls = TIER_CLS[tier] || TIER_CLS.D
              return (
                <Link
                  key={member.source_id}
                  href={`/calling/${0}/${member.source_id}`}
                  className="flex items-center gap-4 px-6 py-3 hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition-colors group cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-warm-900 dark:text-warm-50 group-hover:text-teal transition-colors truncate">
                      {member.full_name}
                    </div>
                    <div className="text-xs text-warm-400 dark:text-warm-dark-400 truncate">
                      {member.mobile_number}
                    </div>
                  </div>
                  <span className="hidden sm:block text-xs text-warm-500 dark:text-warm-dark-500 w-28 truncate">
                    {member.home_amphure}
                  </span>
                  <div className="hidden md:flex items-center gap-2 w-20 text-xs">
                    {member.total_calls > 0 ? (
                      <>
                        <span className="text-teal font-semibold">{member.total_calls}</span>
                        <span className="text-warm-400 dark:text-warm-dark-400">โทร</span>
                      </>
                    ) : (
                      <span className="text-warm-400 dark:text-warm-dark-400">ยังไม่โทร</span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-md flex-shrink-0 ${tierCls}`}>
                    {tier}
                  </span>
                </Link>
              )
            })
          )}
        </div>

        {/* Footer / Sentinel */}
        <div ref={sentinelRef} className="px-6 py-3 text-center text-xs text-warm-400 dark:text-warm-dark-400 border-t border-warm-200 dark:border-warm-dark-300">
          {hasMore
            ? 'กำลังโหลดเพิ่มเติม...'
            : filteredMembers.length > 0
              ? `แสดงครบ ${filteredMembers.length} คน`
              : ''}
        </div>
      </div>
    </div>
  )
}
