import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import LabelManager from '@/components/kanban/LabelManager.jsx'

// ⚠️ segment คงที่ "labels" จะบังหน้ากระดานของก้อน 3 ถ้าตอนนั้นใช้ /kanban/[board]
//    (Next.js ให้ static ชนะ dynamic เสมอ — /kanban/board ก็ชนแบบเดียวกันอยู่แล้ว)
//    ถึงก้อน 3 ให้ย้ายกระดานไป /kanban/b/[board] อย่าไปขยับหน้านี้ทีหลัง
export async function generateMetadata() {
  const t = await getTranslations('kanban')
  return { title: t('labelsPage.title') }
}

export default async function KanbanLabelsPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  // สิทธิ์ตัดสินที่ API (isKanbanAdmin) — หน้านี้ขึ้นข้อความ "เฉพาะแอดมิน" ถ้าโดน 403
  return <LabelManager />
}
