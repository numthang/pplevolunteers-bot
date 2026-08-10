import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgBrand from '@/components/org/OrgBrand.jsx'

export const metadata = { title: 'อัตลักษณ์' }

export default async function OrgBrandPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  return <OrgBrand orgId={activeOrg.id} />
}
