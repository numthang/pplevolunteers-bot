'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import BulkAssign from '@/components/calling/BulkAssign.jsx'

export default function CampaignPage({ params }) {
  const { campaignId } = use(params)
  const [campaign, setCampaign] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [campaignId])

  const fetchData = async () => {
    try {
      const [campaignRes, memberRes] = await Promise.all([
        fetch('/api/calling/campaigns'),
        fetch(`/api/calling/members?campaignId=${campaignId}&limit=500`)
      ])
      const campaignData = await campaignRes.json()
      const camp = campaignData.data?.find(c => c.id === parseInt(campaignId))
      if (camp) setCampaign(camp)

      const memberData = await memberRes.json()
      if (memberData.data) setMembers(memberData.data)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-warm-400 dark:text-warm-dark-400 text-sm">
        กำลังโหลด...
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="py-20 text-center text-red-500 text-sm">
        ไม่พบแคมเปญ
      </div>
    )
  }

  const districts = [...new Set(members.map(m => m.home_amphure).filter(Boolean))].sort()
  const tiers = ['A', 'B', 'C', 'D']

  const tierCount = tiers.reduce((acc, t) => {
    acc[t] = members.filter(m => (m.tier || 'D') === t).length
    return acc
  }, {})

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6 text-sm text-warm-500 dark:text-warm-dark-500">
        <Link href="/calling" className="text-teal hover:underline">แคมเปญ</Link>
        <span className="mx-2">›</span>
        <span className="text-warm-900 dark:text-warm-50">{campaign.name}</span>
      </div>

      {/* Campaign header */}
      <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-6 mb-6">
        <h1 className="text-xl font-medium text-warm-900 dark:text-warm-50 mb-1">{campaign.name}</h1>
        {campaign.description && (
          <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-4">{campaign.description}</p>
        )}
        <div className="flex flex-wrap gap-6 text-sm mt-4">
          <div className="flex gap-2">
            <span className="text-warm-500 dark:text-warm-dark-500">สมาชิกทั้งหมด</span>
            <span className="font-semibold text-warm-900 dark:text-warm-50">{members.length} คน</span>
          </div>
          {campaign.province && (
            <div className="flex gap-2">
              <span className="text-warm-500 dark:text-warm-dark-500">จังหวัด</span>
              <span className="font-semibold text-warm-900 dark:text-warm-50">{campaign.province}</span>
            </div>
          )}
        </div>

        {/* Tier summary pills */}
        {members.length > 0 && (
          <div className="flex gap-2 mt-4">
            {tiers.map(t => tierCount[t] > 0 && (
              <span key={t} className={`px-2.5 py-1 rounded-md text-xs font-semibold tier-${t.toLowerCase()}`}>
                {t}: {tierCount[t]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Assign */}
      <BulkAssign
        campaignId={campaignId}
        members={members}
        districts={districts}
        tiers={tiers}
        onAssignComplete={fetchData}
      />
    </div>
  )
}
