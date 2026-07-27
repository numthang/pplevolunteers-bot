import { getOrgSession } from '@/lib/orgAuth.js'
import { getInviteLinkByToken } from '@/db/orgInviteLinks.js'
import JoinInvite from '@/components/org/JoinInvite.jsx'

export const metadata = { title: 'เข้าร่วมองค์กร' }

// /join/[token] — landing ของ invite link · ใครเปิดก็ได้ (public) → login → เข้าร่วม
export default async function JoinPage({ params }) {
  const { token } = await params
  const link = await getInviteLinkByToken(token)
  const session = await getOrgSession()

  return (
    <JoinInvite
      token={token}
      loggedIn={!!session?.user?.userId}
      org={link ? { name: link.org_name, icon: link.org_icon } : null}
      invalid={link ? link.invalid : 'not_found'}
    />
  )
}
