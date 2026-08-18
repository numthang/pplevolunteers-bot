import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import FieldManager from '@/components/kanban/FieldManager.jsx'

// ⚠️ segment คงที่ "fields" เหมือน "labels"/"board" — ถึงก้อน 3 ให้ย้ายกระดานไป /kanban/b/[board] แทน
export async function generateMetadata() {
  const t = await getTranslations('kanban')
  return { title: t('fieldsPage.title') }
}

export default async function KanbanFieldsPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  // สิทธิ์ตัดสินที่ API (isKanbanAdmin) — หน้านี้ขึ้นข้อความ "เฉพาะแอดมิน" ถ้าโดน 403
  return <FieldManager />
}
