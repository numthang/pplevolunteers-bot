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
      const campaignRes = await fetch(`/api/calling/campaigns`)
      const campaignData = await campaignRes.json()
      const camp = campaignData.data?.find(c => c.id === parseInt(campaignId))
      if (camp) setCampaign(camp)

      const memberRes = await fetch(`/api/calling/members?campaignId=${campaignId}&limit=500`)
      const memberData = await memberRes.json()
      if (memberData.data) {
        setMembers(memberData.data)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
  }

  if (!campaign) {
    return <div className="p-8 text-center text-red-600 dark:text-red-400">ไม่พบแคมเปญ</div>
  }

  const districts = [...new Set(members.map(m => m.district))].sort()
  const tiers = ['A', 'B', 'C', 'D']

  return (
    <div>
      <Link href="/calling" className="text-indigo-600 dark:text-indigo-400 hover:underline mb-4 block text-sm">
        ← กลับ
      </Link>

      {/* Campaign Header */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-gray-100">{campaign.name}</h1>
        {campaign.province && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">จังหวัด: {campaign.province}</p>
        )}
        {campaign.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{campaign.description}</p>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          สมาชิกทั้งหมด: {members.length} คน
        </p>
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
