import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth-options.js'
import { getUserScope, isAdmin } from '@/lib/callingAccess.js'
import { getCampaigns } from '@/db/calling/campaigns.js'

export default async function CallingPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.discordId) {
    return (
      <div className="p-8 text-center text-red-600 dark:text-red-400">
        กรุณาเข้าสู่ระบบก่อนใช้งาน
      </div>
    )
  }

  const userRoles = session.user.roles || []
  const userScope = getUserScope(userRoles)
  const isUserAdmin = isAdmin(userRoles)

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
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium text-warm-900 dark:text-warm-50 mb-1">แคมเปญการโทร</h1>
          <p className="text-sm text-warm-500 dark:text-warm-dark-500">เลือกรอบการโทรที่ต้องการ</p>
        </div>
        <Link
          href="/calling/create"
          className="bg-teal hover:opacity-90 text-white px-5 py-2.5 rounded-md text-sm font-medium transition"
        >
          + สร้างแคมเปญใหม่
        </Link>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-12 text-center text-warm-500 dark:text-warm-dark-500">
          ไม่มีแคมเปญ
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([province, list]) => (
            <section key={province}>
              <h2 className="text-sm font-semibold text-warm-500 dark:text-warm-dark-500 uppercase tracking-wide mb-3">
                {province}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(campaign => (
                  <Link key={campaign.id} href={`/calling/${campaign.id}`}>
                    <div className="bg-white dark:bg-warm-dark-100 border border-warm-200 dark:border-warm-dark-300 rounded-xl p-6 hover:border-teal dark:hover:border-teal hover:shadow-sm transition cursor-pointer group">
                      <h3 className="text-base font-medium text-warm-900 dark:text-warm-50 mb-1 group-hover:text-teal transition-colors">
                        {campaign.name}
                      </h3>
                      {campaign.description && (
                        <p className="text-sm text-warm-500 dark:text-warm-dark-500 mb-3 line-clamp-2">
                          {campaign.description}
                        </p>
                      )}
                      <div className="flex justify-between text-xs text-warm-400 dark:text-warm-dark-400 mt-3">
                        <span>สร้าง {new Date(campaign.created_at).toLocaleDateString('th-TH')}</span>
                        {campaign.member_count > 0 && (
                          <span>{campaign.member_count} คน</span>
                        )}
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
