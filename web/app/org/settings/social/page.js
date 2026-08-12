import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgSocialAccounts from '@/components/org/OrgSocialAccounts.jsx'

export const metadata = { title: 'บัญชีโซเชียล' }

export default async function OrgSocialPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  return <OrgSocialAccounts />
}
