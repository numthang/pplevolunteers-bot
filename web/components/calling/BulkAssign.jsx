'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const PAGE_SIZE = 50

const TIER_CLS = {
  A: 'bg-[#ead3ce] text-[#714b2b] dark:bg-[#3d2318] dark:text-[#d4a48a]',
  B: 'bg-[#cce5f4] text-[#0c447c] dark:bg-[#0c2640] dark:text-[#7bbfec]',
  C: 'bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e]',
  D: 'bg-[#fcebeb] text-[#a32d2d] dark:bg-[#3a1212] dark:text-[#d47373]',
}

const selectCls = 'h-11 px-3 text-base border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal'
const inputCls = 'h-11 px-3 text-base w-full border border-warm-200 dark:border-warm-dark-300 bg-white dark:bg-warm-dark-100 text-warm-900 dark:text-warm-50 placeholder-warm-400 dark:placeholder-warm-dark-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal'

export default function BulkAssign({ campaignId, members, districts = [], tiers = ['A', 'B', 'C', 'D'], onAssignComplete }) {
  const [selectedMembers, setSelectedMembers] = useState(new Set())
  const [filterDistrict, setFilterDistrict] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef(null)

  const filteredMembers = members.filter(m => {
    if (filterDistrict && m.home_amphure !== filterDistrict) return false
    if (filterTier && m.tier !== filterTier) return false
    return true
  })

  const visibleMembers = filteredMembers.slice(0, visibleCount)
  const hasMore = visibleCount < filteredMembers.length

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filterDistrict, filterTier])

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
      setSelectedMembers(new Set(filteredMembers.map(m => m.source_id)))
    }
  }

  const handleSelectMember = (memberId) => {
    const newSet = new Set(selectedMembers)
    if (newSet.has(memberId)) newSet.delete(memberId)
    else newSet.add(memberId)
    setSelectedMembers(newSet)
  }

  const handleBulkAssign = async () => {
    if (!assignTo.trim()) {
      alert('กรุณาระบุผู้รับผิดชอบ')
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
          assigned_to: assignTo.trim()
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

  const handleBulkUnassign = async () => {
    if (selectedMembers.size === 0) {
      alert('กรุณาเลือกสมาชิก')
      return
    }
    if (!confirm(`ยกเลิกการมอบหมาย ${selectedMembers.size} คน?`)) return
    setIsLoading(true)
    try {
      const promises = Array.from(selectedMembers).map(memberId =>
        fetch('/api/calling/assignments', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaign_id: parseInt(campaignId),
            member_id: memberId
          })
        })
      )
      const results = await Promise.all(promises)
      if (!results.every(r => r.ok)) throw new Error('Some unassignments failed')
      alert('ยกเลิกการมอบหมายสำเร็จ')
      setSelectedMembers(new Set())
      onAssignComplete?.()
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const isAllSelected = selectedMembers.size === filteredMembers.length && filteredMembers.length > 0

  return (
    <div>
      {/* Filter row */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-base font-medium text-warm-500 dark:text-warm-dark-500 mb-1">อำเภอ</label>
          <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)} className={selectCls}>
            <option value="">ทั้งหมด</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-base font-medium text-warm-500 dark:text-warm-dark-500 mb-1">ระดับ</label>
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className={selectCls}>
            <option value="">ทั้งหมด</option>
            {tiers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label className="block text-base font-medium text-warm-500 dark:text-warm-dark-500 mb-1">มอบหมายให้</label>
          <input
            type="text"
            value={assignTo}
            onChange={e => setAssignTo(e.target.value)}
            placeholder="ชื่อผู้รับผิดชอบ"
            className={inputCls}
          />
        </div>
        <button
          onClick={handleBulkAssign}
          disabled={selectedMembers.size === 0 || isLoading}
          className="h-11 px-4 bg-teal hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition whitespace-nowrap"
        >
          {isLoading ? 'กำลังมอบหมาย...' : `มอบหมาย ${selectedMembers.size > 0 ? `(${selectedMembers.size})` : ''}`}
        </button>
        <button
          onClick={handleBulkUnassign}
          disabled={selectedMembers.size === 0 || isLoading}
          className="h-11 px-4 bg-red-500 hover:opacity-90 text-white text-base font-medium rounded-lg disabled:opacity-40 transition whitespace-nowrap"
        >
          {isLoading ? 'กำลัง...' : `ยกเลิก ${selectedMembers.size > 0 ? `(${selectedMembers.size})` : ''}`}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl overflow-hidden">
        {/* Checkbox header */}
        <div className="flex items-center gap-3 px-6 py-3 bg-warm-100 dark:bg-warm-dark-200 border-b border-warm-200 dark:border-warm-dark-300 text-base">
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={handleSelectAll}
            className="w-4 h-4 accent-teal cursor-pointer"
          />
          <span className="text-warm-700 dark:text-warm-50 font-medium">
            สมาชิก {filteredMembers.length} คน
          </span>
        </div>

        {/* Member rows */}
        <div className="divide-y divide-warm-200 dark:divide-warm-dark-300">
          {visibleMembers.map(member => {
            const tier = member.tier || 'D'
            const tierCls = TIER_CLS[tier] || TIER_CLS.D
            const status = member.member_status || 'unassigned'

            let statusBadge
            if (status === 'called') {
              statusBadge = (
                <span className="text-sm font-medium px-2.5 py-1 rounded-md bg-teal-light text-teal dark:bg-teal-dim dark:text-teal-bright hidden md:block whitespace-nowrap">
                  โทรแล้ว
                </span>
              )
            } else if (status === 'assigned') {
              statusBadge = (
                <span className="text-sm font-medium px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 hidden md:block whitespace-nowrap">
                  มอบหมายแล้ว
                </span>
              )
            } else {
              statusBadge = (
                <span className="text-sm font-medium px-2.5 py-1 rounded-md bg-[#faeeda] text-[#854f0b] dark:bg-[#3a2308] dark:text-[#d4953e] hidden md:block whitespace-nowrap">
                  รอมอบหมาย
                </span>
              )
            }

            return (
              <div
                key={member.source_id}
                className="flex items-center gap-4 px-6 py-3 hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(member.source_id)}
                  onChange={() => handleSelectMember(member.source_id)}
                  className="w-4 h-4 accent-teal cursor-pointer flex-shrink-0"
                />
                <span className="font-medium text-base text-warm-900 dark:text-warm-50 flex-1 min-w-0 truncate">
                  {member.full_name}
                </span>
                <span className="text-sm text-warm-500 dark:text-warm-dark-500 hidden sm:block w-28 truncate">
                  {member.home_amphure}
                </span>
                {statusBadge}
                <span className={`text-sm font-semibold px-2.5 py-1 rounded-md flex-shrink-0 ${tierCls}`}>
                  {tier}
                </span>
                {member.assigned_to && (
                  <span className="text-sm text-warm-400 dark:text-warm-dark-400 hidden lg:block truncate max-w-32">
                    → {member.assigned_to}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Sentinel / footer */}
        <div ref={sentinelRef} className="px-6 py-3 text-center text-sm text-warm-400 dark:text-warm-dark-400 border-t border-warm-200 dark:border-warm-dark-300">
          {hasMore
            ? 'กำลังโหลดเพิ่มเติม...'
            : filteredMembers.length > 0
              ? `แสดงครบ ${filteredMembers.length} คน`
              : 'ไม่พบสมาชิก'}
        </div>
      </div>
    </div>
  )
}
