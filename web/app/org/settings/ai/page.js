import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgAi from '@/components/org/OrgAi.jsx'

export const metadata = { title: 'AI' }

export default async function OrgAiPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  return <OrgAi orgId={activeOrg.id} />
}
