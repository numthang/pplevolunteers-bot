'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { FileText } from 'lucide-react'

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

const KNOWN_STATUSES = ['draft', 'active', 'closed']
const STATUS_COLOR = {
  draft:  'bg-warm-100 text-warm-500 dark:bg-disc-hover dark:text-disc-muted',
  active: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-warm-100 text-warm-400 dark:bg-disc-hover dark:text-disc-muted',
}

export default function DocProjectCard({ project }) {
  const t = useTranslations('docs')
  const signed  = Number(project.signed_count)  || 0
  const total   = Number(project.entry_count)   || 0
  const hasProject = Boolean(project.id)

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg hover:border-teal dark:hover:border-teal hover:shadow-md transition h-full flex flex-col">
      <Link href={`/docs/${project.act_event_cache_id}`} className="flex-1 block group">
        <div className="h-36 rounded-t-lg overflow-hidden">
          <img
            src={project.image_url || FALLBACK_IMAGE}
            alt={project.event_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text group-hover:text-teal transition-colors line-clamp-2">
              {project.event_name}
            </h3>
            {hasProject ? (
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[project.status] || STATUS_COLOR.draft}`}>
                {KNOWN_STATUSES.includes(project.status) ? t(`projectCard.statusLabels.${project.status}`) : project.status}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-warm-100 text-warm-400 dark:bg-disc-hover dark:text-disc-muted">
                {t('projectCard.notConfigured')}
              </span>
            )}
          </div>
          {project.event_date && (
            <p className="text-base text-warm-500 dark:text-disc-muted mb-1">
              {formatEventDate(project.event_date)}
            </p>
          )}
          {project.is_mobile && (
            <span className="text-xs text-orange font-medium">{t('projectCard.mobile')}</span>
          )}
        </div>
      </Link>

      <div className="px-4 py-2.5 border-t border-warm-200 dark:border-disc-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-base text-warm-500 dark:text-disc-muted">
          <FileText size={14} />
          {hasProject
            ? <span>{t('projectCard.signedCount', { signed, total })}</span>
            : <span className="text-xs">{t('projectCard.clickToConfigure')}</span>
          }
        </div>
        {project.budget && (
          <span className="text-xs text-warm-400 dark:text-disc-muted shrink-0">
            {t('projectCard.budget', { amount: Number(project.budget).toLocaleString() })}
          </span>
        )}
      </div>
    </div>
  )
}
