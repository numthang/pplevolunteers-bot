import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getUserScope, isAdmin, canCreateCampaign } from '@/lib/callingAccess.js'
import { getCampaigns } from '@/db/calling/campaigns.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import CampaignCard from '@/components/calling/CampaignCard.jsx'
import DocsProvinceFilter from '@/components/docs/DocsProvinceFilter.jsx'

export async function generateMetadata() {
  const t = await getTranslations('calling')
  return { title: t('campaigns.pageTitle') }
}

export default async function CallingPage({ searchParams }) {
  const session = await getSession()
  if (!session) redirect('/')

  const t = await getTranslations('calling')
  const { access } = await getEffectiveOrgIdentity(session)
  const userScope = getUserScope(access)
  const isUserAdmin = isAdmin(access)
  const canCreate = canCreateCampaign(access)

  const campaigns = await getCampaigns(await getOrgId(session))
  const filteredCampaigns = campaigns.filter(
    c => !c.province || isUserAdmin || userScope.includes(c.province)
  )

  const selectedProvince = (await searchParams)?.province || ''
  const provinces = [...new Set(filteredCampaigns.map(c => c.province).filter(Boolean))].sort()
  const displayed = selectedProvince
    ? filteredCampaigns.filter(c => c.province === selectedProvince)
    : filteredCampaigns

  const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - 7)
  const cutoff = cutoffDate.toISOString().slice(0, 10)
  const active = displayed.filter(c => !c.event_date || c.event_date >= cutoff)
  const past   = displayed.filter(c => c.event_date && c.event_date < cutoff)

  const groupBy = list => list.reduce((acc, c) => {
    const key = c.province || t('campaigns.generalGroup')
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  const grouped     = groupBy(active)
  const groupedPast = groupBy(past)

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-2">{t('campaigns.pageTitle')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">
            {t('campaigns.subtitle')}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/calling/campaigns/create"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-orange text-white text-base font-medium rounded-lg hover:bg-orange-light transition"
          >
            <span>+</span> {t('campaigns.createButton')}
          </Link>
        )}
      </div>

      {provinces.length > 1 && (
        <div className="mb-6">
          <Suspense>
            <DocsProvinceFilter provinces={provinces} selected={selectedProvince} />
          </Suspense>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center text-warm-500 dark:text-disc-muted">
          {t('campaigns.noCampaigns')}
        </div>
      ) : (
        <div className="space-y-8">
          {active.length === 0 && (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center text-warm-500 dark:text-disc-muted">
              {t('campaigns.noActiveCampaigns')}
            </div>
          )}
          {Object.entries(grouped).map(([province, list]) => (
            <section key={province}>
              <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-widest mb-4">
                {province}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(campaign => (
                  <CampaignCard key={campaign.id} campaign={campaign} canCreate={canCreate} />
                ))}
              </div>
            </section>
          ))}

          {past.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest select-none w-fit">
                <span className="transition-transform group-open:rotate-90">▶</span>
                {t('campaigns.pastEvents', { count: past.length })}
              </summary>
              <div className="mt-4 space-y-8 opacity-60">
                {Object.entries(groupedPast).map(([province, list]) => (
                  <section key={province}>
                    <h2 className="text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest mb-4">
                      {province}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {list.map(campaign => (
                        <CampaignCard key={campaign.id} campaign={campaign} canCreate={canCreate} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
