import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { countByStatus } from '@/db/cases.js'
import { orgIdOfGuild } from '@/db/guilds.js'
import { statusLabel } from '@/lib/caseOptions.js'
import CaseRefLookup from '@/components/case/CaseRefLookup.jsx'
import LocationButton from '@/components/case/LocationButton.jsx'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: t('landing.metaTitle') }
}

export default async function CasePublicHome() {
  const t = await getTranslations('case')
  let counts = {}
  try {
    const orgId = await orgIdOfGuild(process.env.GUILD_ID) // public — นับทั้ง org ของ guild หลัก, ทุกจังหวัด
    counts = await countByStatus(orgId)
  } catch { counts = {} }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const cards = [
    { key: 'total', label: t('landing.totalLabel'), value: total },
    { key: 'in_progress', label: statusLabel('in_progress'), value: counts.in_progress || 0 },
    { key: 'resolved', label: statusLabel('resolved'), value: (counts.resolved || 0) + (counts.closed || 0) },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-disc-text mb-2">{t('landing.heading')}</h1>
        <p className="text-base text-gray-500 dark:text-disc-muted">
          {t('landing.description')}
        </p>
      </div>

      {/* stat headline */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {cards.map(c => (
          <div key={c.key} className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange">{c.value}</p>
            <p className="text-sm text-gray-500 dark:text-disc-muted mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* แจ้งเรื่องใหม่ */}
      <div className="space-y-2 mb-8">
        <Link href="/case/new"
          className="block w-full bg-brand-orange text-white py-4 rounded-xl text-lg font-semibold hover:bg-brand-orange-light transition text-center">
          {t('landing.newCaseButton')}
        </Link>
        <LocationButton />
      </div>

      {/* ติดตาม ref */}
      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-700 dark:text-disc-text mb-3">{t('landing.trackHeading')}</h2>
        <CaseRefLookup />
        <p className="mt-2 text-sm text-gray-400 dark:text-disc-muted">{t('landing.trackHint')}</p>
      </div>
    </div>
  )
}
