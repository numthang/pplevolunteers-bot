'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export default function CallingBreadcrumb({ currentCampaignId, title = 'Pending Calls' }) {
  const [campaigns, setCampaigns] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    fetch('/api/calling/campaigns?active=true&limit=50')
      .then(r => r.json())
      .then(d => setCampaigns(d.data || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const isPending = pathname.includes('/pending')
  const currentCampaign = campaigns.find(c => c.id === parseInt(currentCampaignId))
  const dropdownLabel = currentCampaign?.name || (isPending ? 'All Campaigns' : 'Campaign')

  const handleSelectCampaign = (campaignId) => {
    setIsOpen(false)
    if (isPending) {
      const params = new URLSearchParams(searchParams)
      if (campaignId) params.set('campaignId', campaignId)
      else params.delete('campaignId')
      router.push(`/calling/pending?${params}`)
    } else {
      router.push(`/calling/${campaignId}`)
    }
  }

  return (
    <div className="mb-6 text-sm text-warm-500 dark:text-warm-dark-500 flex items-center gap-0">
      {/* Root: Campaigns or page title */}
      <Link href="/calling" className="text-teal hover:underline shrink-0">
        Campaigns
      </Link>

      {/* Separator + campaign dropdown inline */}
      <span className="mx-2 shrink-0">›</span>

      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-warm-900 dark:text-warm-50 font-medium hover:text-teal transition focus:outline-none group"
        >
          <span>{dropdownLabel}</span>
          <svg
            className={`w-3.5 h-3.5 text-warm-400 dark:text-warm-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Dropdown panel */}
        {isOpen && (
          <div className="absolute left-0 mt-2 w-64 bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl shadow-lg z-50 max-h-72 overflow-y-auto py-1">
            {/* All campaigns option (pending page only) */}
            {isPending && (
              <button
                onClick={() => handleSelectCampaign(null)}
                className={`w-full text-left px-4 py-2.5 hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition text-sm ${
                  !currentCampaignId ? 'text-teal font-medium' : 'text-warm-700 dark:text-warm-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>All Campaigns</span>
                  {!currentCampaignId && <span className="text-teal text-xs">✓</span>}
                </div>
                <div className="text-xs text-warm-400 dark:text-warm-dark-400 mt-0.5">Show all assigned members</div>
              </button>
            )}

            {/* Divider after all-campaigns option */}
            {isPending && campaigns.length > 0 && (
              <div className="border-t border-warm-100 dark:border-warm-dark-300 my-1" />
            )}

            {campaigns.map(c => {
              const isActive = parseInt(currentCampaignId) === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectCampaign(c.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-warm-50 dark:hover:bg-warm-dark-200 transition text-sm ${
                    isActive ? 'text-teal font-medium' : 'text-warm-700 dark:text-warm-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate pr-2">{c.name}</span>
                    {isActive && <span className="text-teal text-xs shrink-0">✓</span>}
                  </div>
                  {isPending && c.pending_count !== undefined && (
                    <div className="text-xs text-warm-400 dark:text-warm-dark-400 mt-0.5">
                      {c.pending_count} pending
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending page: show sub-label */}
      {isPending && (
        <>
          <span className="mx-2 shrink-0">›</span>
          <span className="text-warm-500 dark:text-warm-dark-500">Pending Calls</span>
        </>
      )}
    </div>
  )
}
