import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { guildsOfOrg } from '@/db/guilds.js'
import OrgSocialAccounts from '@/components/org/OrgSocialAccounts.jsx'
import OrgSocialGroups from '@/components/org/OrgSocialGroups.jsx'

export const metadata = { title: 'บัญชีโซเชียล' }

export default async function OrgSocialPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  // ลิสต์เซิร์ฟของ org ส่งเป็น prop (แบบเดียวกับ GuildSwitcherBar) — ไม่ต้องมี endpoint เพิ่ม
  const guilds = await guildsOfOrg(activeOrg.id)

  return (
    <div className="flex flex-col gap-8">
      <OrgSocialAccounts />
      <OrgSocialGroups guilds={guilds} />
    </div>
  )
}
