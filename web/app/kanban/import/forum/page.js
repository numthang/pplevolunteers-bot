import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canImportForum } from '@/lib/kanbanAccess.js'
import ForumImportHome from '@/components/kanban/ForumImportHome.jsx'

export async function generateMetadata() {
  const t = await getTranslations('kanbanImport')
  return { title: t('meta.title') }
}

// คัดกระทู้ดิสฯ (คณะทำงาน/อำเภอ/สมาชิกพรรค) เข้าเป็นการ์ด KANBAN
// admin เท่านั้น — สร้างการ์ดทีละหลายสิบใบเข้ากระดานที่คนทั้ง org เห็น
export default async function ForumImportPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  const t = await getTranslations('kanbanImport')
  const { access } = await getEffectiveOrgIdentity(session)
  if (!canImportForum(access)) {
    return (
      <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">
        {t('adminOnly')}
      </div>
    )
  }

  return <ForumImportHome />
}
