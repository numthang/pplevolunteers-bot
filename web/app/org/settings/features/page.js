import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgFeatures from '@/components/org/OrgFeatures.jsx'

export const metadata = { title: 'ฟีเจอร์' }

export default async function OrgFeaturesPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  return <OrgFeatures orgId={activeOrg.id} />
}
