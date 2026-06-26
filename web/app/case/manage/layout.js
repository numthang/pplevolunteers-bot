import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageCases } from '@/lib/caseAccess.js'

export const metadata = { title: { default: 'จัดการเรื่องร้องเรียน', template: '%s — เรื่องร้องเรียน' } }

// gate ด่านเดียว: ทุกหน้าใต้ /case/manage ต้อง login + canManageCases
export default async function CaseManageLayout({ children }) {
  const session = await getSession()
  if (!session) redirect('/')
  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) redirect('/case')
  return children
}
