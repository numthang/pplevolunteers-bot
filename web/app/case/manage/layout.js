import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageCases } from '@/lib/caseAccess.js'
import { requireFeature } from '@/lib/featureGate.js'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: { default: t('manage.layoutMetaTitleDefault'), template: t('manage.layoutMetaTitleTemplate') } }
}

// gate ด่านเดียว: ทุกหน้าใต้ /case/manage ต้อง login + feature เปิด + canManageCases
export default async function CaseManageLayout({ children }) {
  const session = await getSession()
  if (!session) redirect('/')
  await requireFeature(session, 'cases')
  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) redirect('/case')
  return children
}
