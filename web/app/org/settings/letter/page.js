import { redirect } from 'next/navigation'
import { requireOrgUser } from '@/lib/orgAuth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import OrgLetterConfig from '@/components/org/OrgLetterConfig.jsx'

export const metadata = { title: 'หัวจดหมายร้องเรียน' }

export default async function OrgLetterConfigPage() {
  const session = await requireOrgUser()
  const { activeOrg } = await resolveActiveOrg(session.user.userId)
  if (!activeOrg) redirect('/org')

  // ด่านสิทธิ์จริงอยู่ที่ /api/case/letter-config (canManageCases) — requireOrgUser เช็คแค่ล็อกอิน
  return <OrgLetterConfig />
}
