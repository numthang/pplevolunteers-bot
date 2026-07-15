import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgHome from '@/components/org/OrgHome.jsx'

export const metadata = { title: 'องค์กรของฉัน' }

export default async function OrgDashboard() {
  const session = await requireOrgUser()
  const { activeOrg, orgs } = await resolveActiveOrg(session.user.userId)
  return (
    <OrgHome
      user={{ email: session.user.email, name: session.user.name }}
      orgs={orgs}
      activeOrg={activeOrg}
    />
  )
}
