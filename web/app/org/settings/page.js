import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getOrgMembership, listOrgMembers } from '@/db/orgMembers.js'
import OrgSettings from '@/components/org/OrgSettings.jsx'

export const metadata = { title: 'ตั้งค่าองค์กร' }

export default async function OrgSettingsPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  const [membership, members] = await Promise.all([
    getOrgMembership(activeOrg.id, session.user.userId),
    listOrgMembers(activeOrg.id),
  ])

  return (
    <OrgSettings
      org={activeOrg}
      members={members}
      me={session.user.userId}
      myRole={membership?.role || 'member'}
    />
  )
}
