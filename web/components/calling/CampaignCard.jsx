'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Pencil, Trash2 } from 'lucide-react'

const FALLBACK_IMAGE = 'https://act.pplethai.org/wp-content/uploads/2024/09/pple-cover-yt.jpg'

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

  const calendarUrl = buildGoogleCalendarUrl(campaign)

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg hover:border-teal dark:hover:border-teal hover:shadow-md transition h-full flex flex-col">
      <Link href={`/calling/assignments/${campaign.id}`} className="flex-1 block group">
        <div className="h-36 rounded-t-lg overflow-hidden">
          <img src={campaign.image_url || FALLBACK_IMAGE} alt={campaign.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <div className="p-4">
          <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text mb-1 group-hover:text-teal transition-colors line-clamp-2">
            {campaign.name}
          </h3>
          {campaign.event_date && (
            <p className="text-base text-warm-500 dark:text-disc-muted mb-1">
              {formatEventDate(campaign.event_date)}
            </p>
          )}
          {campaign.description && (
            <p className="text-base text-warm-500 dark:text-disc-muted line-clamp-2">
              {campaign.description}
            </p>
          )}
        </div>
      </Link>

      {/* unified footer */}
      <div className="px-4 py-2.5 border-t border-warm-200 dark:border-disc-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-base text-warm-500 dark:text-disc-muted">
            {campaign.call_count || 0} การโทร
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {calendarUrl && (
            <a
              href={calendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="เพิ่มใน Google Calendar"
              className="p-1.5 rounded hover:bg-warm-100 dark:hover:bg-disc-hover text-teal transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <Calendar size={16} />
            </a>
          )}
          {canCreate && (
            <>
              <Link
                href={`/calling/campaigns/${campaign.id}/edit`}
                title="แก้ไข"
                className="p-1.5 rounded hover:bg-warm-100 dark:hover:bg-disc-hover text-teal transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <Pencil size={16} />
              </Link>
              <button
                onClick={handleDelete}
                title="ลบ"
                className="p-1.5 rounded hover:bg-warm-100 dark:hover:bg-disc-hover text-red-500 dark:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
