'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function CampaignCard({ campaign, canCreate }) {
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm(`ลบแคมเปญ "${campaign.name}" ?\n\nข้อมูลการมอบหมายและบันทึกการโทรที่เกี่ยวข้องอาจได้รับผลกระทบ`)) return
    const res = await fetch(`/api/calling/campaigns/${campaign.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('เกิดข้อผิดพลาด ไม่สามารถลบได้'); return }
    router.refresh()
  }

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-warm-dark-300 rounded-lg hover:border-teal dark:hover:border-teal hover:shadow-md transition h-full flex flex-col">
      <Link href={`/calling/${campaign.id}`} className="flex-1 block p-6 group">
        <h3 className="text-base font-medium text-warm-900 dark:text-warm-50 mb-2 group-hover:text-teal transition-colors line-clamp-2">
          {campaign.name}
        </h3>
        {campaign.description && (
          <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-4 line-clamp-2">
            {campaign.description}
          </p>
        )}
        <div className="space-y-1.5 pt-2 border-t border-warm-200 dark:border-warm-dark-200 text-sm">
          <div className="flex justify-between items-center text-warm-400 dark:text-warm-dark-400">
            <span className="font-medium text-warm-900 dark:text-warm-50">
              {campaign.call_count || 0} การโทร
            </span>
            {campaign.event_date && (
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                วันจัดกิจกรรม: {new Date(campaign.event_date).toLocaleDateString('th-TH')}
              </span>
            )}
          </div>
        </div>
      </Link>

      {canCreate && (
        <div className="px-4 py-2 border-t border-warm-200 dark:border-warm-dark-200 flex gap-3">
          <Link
            href={`/calling/edit/${campaign.id}`}
            className="text-sm text-teal hover:underline"
          >
            แก้ไข
          </Link>
          <button
            onClick={handleDelete}
            className="text-sm text-red-500 dark:text-red-400 hover:underline"
          >
            ลบ
          </button>
        </div>
      )}
    </div>
  )
}
