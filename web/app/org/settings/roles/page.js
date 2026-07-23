import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgScopeTree from '@/components/org/OrgScopeTree.jsx'

export const metadata = { title: 'ยศและพื้นที่' }

export default async function OrgRolesPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  return <OrgScopeTree />
}
