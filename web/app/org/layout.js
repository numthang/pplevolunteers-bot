import { getOrgSession } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgShell from '@/components/org/OrgShell.jsx'

// /org/* shell — switcher [ส่วนตัว ↔ องค์กร] · หน้า login/verify (ยังไม่มี session) render เปล่า
export default async function OrgLayout({ children }) {
  const session = await getOrgSession()
  if (!session?.user?.userId) return children

  const { activeOrg, orgs } = await resolveActiveOrg(session.user.userId)
  return (
    <OrgShell user={session.user} orgs={orgs} activeOrg={activeOrg}>
      {children}
    </OrgShell>
  )
}
