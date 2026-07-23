import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import OrgGeneral from '@/components/org/OrgGeneral.jsx'

export default async function OrgSettingsGeneralPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  const membership = await getOrgMembership(activeOrg.id, session.user.userId)

  return <OrgGeneral org={activeOrg} myRole={membership?.role || 'member'} />
}
