'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function formatEventDate(dateStr) {
  if (!dateStr) return ''
  const [datePart, timePart] = dateStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  let result = `${day} ${THAI_MONTHS[month - 1]} ${year + 543}`
  if (timePart && timePart !== '00:00') result += ` ${timePart} น.`
  return result
}

function buildGoogleCalendarUrl(campaign) {
  if (!campaign.event_date) return null
  const pad = n => String(n).padStart(2, '0')
  const [datePart, timePart] = campaign.event_date.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const hasTime = timePart && timePart !== '00:00'
  let dates
  if (hasTime) {
    const [h, mi] = timePart.split(':').map(Number)
    const start = `${y}${pad(m)}${pad(d)}T${pad(h)}${pad(mi)}00`
    const endDt = new Date(y, m - 1, d, h + 4, mi)
    const end = `${endDt.getFullYear()}${pad(endDt.getMonth() + 1)}${pad(endDt.getDate())}T${pad(endDt.getHours())}${pad(endDt.getMinutes())}00`
    dates = `${start}/${end}`
  } else {
    const next = new Date(y, m - 1, d + 1)
    dates = `${y}${pad(m)}${pad(d)}/${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: campaign.name, dates })
  if (campaign.description) params.set('details', campaign.description)
  if (campaign.province) params.set('location', campaign.province)
  return `https://calendar.google.com/calendar/render?${params}`
}

export default function CampaignCard({ campaign, canCreate }) {
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm(`ลบแคมเปญ "${campaign.name}" ?\n\nข้อมูลการมอบหมายและบันทึกการโทรที่เกี่ยวข้องอาจได้รับผลกระทบ`)) return
    const res = await fetch(`/api/calling/campaigns/${campaign.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('เกิดข้อผิดพลาด ไม่สามารถลบได้'); return }
    router.refresh()
  }

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg hover:border-teal dark:hover:border-teal hover:shadow-md transition h-full flex flex-col">
      <Link href={`/calling/${campaign.id}`} className="flex-1 block p-6 group">
        <h3 className="text-base font-medium text-warm-900 dark:text-disc-text mb-2 group-hover:text-teal transition-colors line-clamp-2">
          {campaign.name}
        </h3>
        {campaign.description && (
          <p className="text-base text-warm-500 dark:text-disc-muted mb-4 line-clamp-2">
            {campaign.description}
          </p>
        )}
        <div className="space-y-1 pt-2 border-t border-warm-200 dark:border-disc-border text-base">
          <span className="font-medium text-warm-900 dark:text-disc-text block">
            {campaign.call_count || 0} การโทร
          </span>
          {campaign.event_date && (
            <span className="text-orange-600 dark:text-orange-400 font-medium block">
              วันจัดกิจกรรม: {formatEventDate(campaign.event_date)}
            </span>
          )}
        </div>
      </Link>

      {(canCreate || campaign.event_date) && (
        <div className="px-4 py-2 border-t border-warm-200 dark:border-disc-border flex gap-3 items-center">
          {campaign.event_date && (
            <a
              href={buildGoogleCalendarUrl(campaign)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base text-teal hover:underline"
            >
              + Google Calendar
            </a>
          )}
          {canCreate && (
            <>
              <Link href={`/calling/edit/${campaign.id}`} className="text-base text-teal hover:underline">
                แก้ไข
              </Link>
              <button onClick={handleDelete} className="text-base text-red-500 dark:text-red-400 hover:underline">
                ลบ
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
