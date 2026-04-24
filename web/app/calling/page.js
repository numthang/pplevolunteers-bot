import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth-options.js'
import { getUserScope, isAdmin, canCreateCampaign } from '@/lib/callingAccess.js'
import { getCampaigns } from '@/db/calling/campaigns.js'
import { getEffectiveRoles } from '@/lib/getEffectiveRoles.js'

export default async function CallingPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.discordId) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        กรุณาเข้าสู่ระบบก่อนใช้งาน
      </div>
    )
  }

  const userRoles = await getEffectiveRoles(session)
  const userScope = getUserScope(userRoles)
  const isUserAdmin = isAdmin(userRoles)
  const canCreate = canCreateCampaign(userRoles)

  const campaigns = await getCampaigns()
  const filteredCampaigns = campaigns.filter(
    c => !c.province || isUserAdmin || userScope.includes(c.province)
  )

  // Group by province
  const grouped = filteredCampaigns.reduce((acc, c) => {
    const key = c.province || 'ทั่วไป'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-warm-900 dark:text-warm-50 mb-2">Campaigns</h1>
          <p className="text-sm text-warm-500 dark:text-warm-dark-500">
            เลือกแคมเปญการโทรที่ต้องการจัดการ
          </p>
        </div>
        {canCreate && (
          <Link
            href="/calling/create"
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-orange text-white text-sm font-medium rounded-lg hover:bg-orange-light transition"
          >
            <span>+</span> สร้างแคมเปญ
          </Link>
        )}
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-warm-dark-300 rounded-xl p-12 text-center text-warm-500 dark:text-warm-dark-500">
          ไม่มีแคมเปญ
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([province, list]) => (
            <section key={province}>
              <h2 className="text-xs font-semibold text-warm-500 dark:text-warm-dark-500 uppercase tracking-widest mb-4">
                {province}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(campaign => (
                  <Link key={campaign.id} href={`/calling/${campaign.id}`}>
                    <div className="bg-card-bg border border-warm-200 dark:border-warm-dark-300 rounded-lg p-6 hover:border-teal dark:hover:border-teal hover:shadow-md transition cursor-pointer group h-full">
                      <h3 className="text-base font-medium text-warm-900 dark:text-warm-50 mb-2 group-hover:text-teal transition-colors line-clamp-2">
                        {campaign.name}
                      </h3>
                      {campaign.description && (
                        <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-4 line-clamp-2">
                          {campaign.description}
                        </p>
                      )}
                      <div className="space-y-1.5 pt-2 border-t border-warm-200 dark:border-warm-dark-200 text-xs">
                        <div className="flex justify-between items-center text-warm-400 dark:text-warm-dark-400">
                          <span className="font-medium text-warm-900 dark:text-warm-50">
                            {campaign.call_count || 0} การโทร
                          </span>
                          <span>
                            {campaign.event_date && (
                              <div className="text-orange-600 dark:text-orange-400 font-medium">
                                วันจัดกิจกรรม : {new Date(campaign.event_date).toLocaleDateString('th-TH')}
                              </div>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
