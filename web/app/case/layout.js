import { getSession, redirectToLogin } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageCases } from '@/lib/caseAccess.js'
import { requireFeature } from '@/lib/featureGate.js'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: { default: t('manage.layoutMetaTitleDefault'), template: t('manage.layoutMetaTitleTemplate') } }
}

// gate ด่านเดียว: ทุกหน้าใต้ /case (จัดการเคส) ต้อง login + feature เปิด + canManageCases
// ⛔ redirect เมื่อไม่ผ่านสิทธิ์ต้องชี้ไป /complaint (ศูนย์รับเรื่องร้องเรียนสาธารณะ) ห้ามชี้กลับ /case — จะวนลูป redirect เพราะ /case เองก็อยู่ใต้ layout นี้
export default async function CaseManageLayout({ children }) {
  const session = await getSession()
  if (!session) await redirectToLogin()
  await requireFeature(session, 'cases')
  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) redirect('/complaint')
  return children
}
