import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUserScope, isAdmin, canCreateCampaign } from '@/lib/callingAccess.js'
import { getCampaigns } from '@/db/calling/campaigns.js'
import { getEffectiveRoles } from '@/lib/getEffectiveRoles.js'
import CampaignCard from '@/components/calling/CampaignCard.jsx'

export default async function CallingPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const userRoles = await getEffectiveRoles(session)
  const userScope = getUserScope(userRoles)
  const isUserAdmin = isAdmin(userRoles)
  const canCreate = canCreateCampaign(userRoles)

  const campaigns = await getCampaigns()
  const filteredCampaigns = campaigns.filter(
    c => !c.province || isUserAdmin || userScope.includes(c.province)
  )

  const today = new Date().toISOString().slice(0, 10)
  const active = filteredCampaigns.filter(c => !c.event_date || c.event_date >= today)
  const past   = filteredCampaigns.filter(c => c.event_date && c.event_date < today)

  const groupBy = list => list.reduce((acc, c) => {
    const key = c.province || 'ทั่วไป'
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
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-2">Campaigns</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">
            เลือกแคมเปญการโทรที่ต้องการจัดการ
          </p>
        </div>
        {canCreate && (
          <Link
            href="/calling/create"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-orange text-white text-base font-medium rounded-lg hover:bg-orange-light transition"
          >
            <span>+</span> สร้างแคมเปญ
          </Link>
        )}
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center text-warm-500 dark:text-disc-muted">
          ไม่มีแคมเปญ
        </div>
      ) : (
        <div className="space-y-8">
          {active.length === 0 && (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center text-warm-500 dark:text-disc-muted">
              ไม่มีแคมเปญที่กำลังดำเนินการ
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
                กิจกรรมที่ผ่านแล้ว ({past.length})
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
