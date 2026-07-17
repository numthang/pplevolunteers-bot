import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getOrgMembership, listOrgStaff } from '@/db/orgMembers.js'
import OrgMembers from '@/components/org/OrgMembers.jsx'

export const metadata = { title: 'สมาชิก & บทบาท' }

export default async function OrgMembersPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  const [membership, members] = await Promise.all([
    getOrgMembership(activeOrg.id, session.user.userId),
    listOrgStaff(activeOrg.id),
  ])

  return (
    <OrgMembers
      org={activeOrg}
      members={members}
      me={session.user.userId}
      myRole={membership?.role || 'member'}
    />
  )
}
