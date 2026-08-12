import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgAi from '@/components/org/OrgAi.jsx'
import OrgPrompts from '@/components/org/OrgPrompts.jsx'

export const metadata = { title: 'AI' }

export default async function OrgAiPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  // prompt อยู่หน้าเดียวกับ key/โมเดล — เรื่องเดียวกันคือ "AI ขององค์กรนี้ทำงานยังไง"
  // OrgPrompts คืน null เองถ้าไม่ใช่ owner (การ์ดข้างบนแจ้งไปแล้ว ไม่ต้องบอกซ้ำ)
  return (
    <div className="space-y-8">
      <OrgAi orgId={activeOrg.id} />
      <OrgPrompts orgId={activeOrg.id} />
    </div>
  )
}
