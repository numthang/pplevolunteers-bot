'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const PAGE_SIZE = 50

const selectCls = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'
const inputCls = 'w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function BulkAssign({ campaignId, members, districts = [], tiers = ['A', 'B', 'C', 'D'], onAssignComplete }) {
  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  const filteredMembers = members.filter(m => {
    if (filterDistrict && m.district !== filterDistrict) return false
    if (filterTier && m.tier !== filterTier) return false
    return true
  })

  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMembers.length

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filterDistrict, filterTier])

  // IntersectionObserver to load more on scroll
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

  const handleSelectAll = () => {
    if (selectedMembers.size === filteredMembers.length) {
      setSelectedMembers(new Set())
    } else {
      setSelectedMembers(new Set(filteredMembers.map(m => m.member_id)))
    }
  }

  const handleSelectMember = (memberId) => {
    const newSet = new Set(selectedMembers)
    if (newSet.has(memberId)) {
      newSet.delete(memberId)
    } else {
      newSet.add(memberId)
    }
    setSelectedMembers(newSet)
  }

  const handleBulkAssign = async () => {
    if (!assignTo) {
      alert('กรุณาเลือกผู้รับผิดชอบ')
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch('/api/calling/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: parseInt(campaignId),
          member_ids: Array.from(selectedMembers),
          assigned_to: assignTo
        })
      })

      if (!res.ok) throw new Error('Failed to assign')

      alert('มอบหมายสำเร็จ')
      setSelectedMembers(new Set())
      setAssignTo('')
      onAssignComplete?.()
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const isAllSelected = selectedMembers.size === filteredMembers.length && filteredMembers.length > 0

  return (
    <div className="mb-8">
      <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4">มอบหมายเป็นชุด</h3>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">อำเภอ</label>
            <select value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)} className={selectCls}>
              <option value="">ทั้งหมด</option>
              {districts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">ระดับ</label>
            <select value={filterTier} onChange={(e) => setFilterTier(e.target.value)} className={selectCls}>
              <option value="">ทั้งหมด</option>
              {tiers.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5 text-gray-700 dark:text-gray-300">มอบหมายให้</label>
            <input
              type="text"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              placeholder="ชื่อหรือ ID"
              className={inputCls}
            />
          </div>
        </div>

        {/* Select All + Assign Button */}
        <div className="flex items-center justify-between mb-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={handleSelectAll}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              เลือกทั้งหมด ({selectedMembers.size}/{filteredMembers.length})
            </span>
          </label>

          <button
            onClick={handleBulkAssign}
            disabled={selectedMembers.size === 0 || isLoading}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {isLoading ? 'กำลังมอบหมาย...' : 'มอบหมาย'}
          </button>
        </div>

        {/* Member list */}
        <div className="space-y-2">
          {visibleMembers.map(member => (
            <div key={member.member_id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <input
                type="checkbox"
                checked={selectedMembers.has(member.member_id)}
                onChange={() => handleSelectMember(member.member_id)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{member.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{member.district}</span>
              <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                {member.tier || 'D'}
              </span>
            </div>
          ))}

          {/* Sentinel for infinite scroll */}
          <div ref={sentinelRef} className="py-1 text-center text-xs text-gray-400 dark:text-gray-500">
            {hasMore ? 'กำลังโหลด...' : filteredMembers.length > 0 ? `แสดงทั้งหมด ${filteredMembers.length} คน` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
