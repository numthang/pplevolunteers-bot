import { getServerSession } from 'next-auth'
import Link from 'next/link'
import { authOptions } from '@/lib/auth-options.js'
import { getUserScope, isAdmin } from '@/lib/callingAccess.js'
import { getCampaigns } from '@/db/calling/campaigns.js'

export default async function CallingPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.discordId) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 dark:text-red-400">Please login to access calling system</p>
      </div>
    )
  }

  const userRoles = session.user.roles || []
  const userScope = getUserScope(userRoles)
  const isUserAdmin = isAdmin(userRoles)

  const campaigns = await getCampaigns()

  const filteredCampaigns = campaigns.filter(c => !c.province || isUserAdmin || userScope.includes(c.province))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">โปรแกรมการโทร</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">เลือกรอบการโทรที่ต้องการ</p>
      </div>

      <div className="mb-6 flex justify-end">
        <Link href="/calling/create" className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
          + สร้างรอบการโทรใหม่
        </Link>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="bg-gray-100 dark:bg-gray-800 p-8 rounded-lg text-center text-gray-500 dark:text-gray-400">
          ไม่มีรอบการโทร
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map(campaign => (
            <Link key={campaign.id} href={`/calling/${campaign.id}`}>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:shadow-md transition cursor-pointer">
                <h2 className="text-lg font-bold mb-1 text-gray-900 dark:text-gray-100">{campaign.name}</h2>
                {campaign.province && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">จังหวัด: {campaign.province}</p>
                )}
                {campaign.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">{campaign.description}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  สร้างเมื่อ: {new Date(campaign.created_at).toLocaleDateString('th-TH')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
