import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import KanbanHome from '@/components/kanban/KanbanHome.jsx'

export async function generateMetadata() {
  const t = await getTranslations('kanban')
  return { title: t('meta.list') }
}

// หน้าเดียวของโมดูลตั้งแต่ 2026-08-18 — /kanban/board redirect มาที่นี่ (ดู KanbanHome.jsx หัวไฟล์)
export default async function KanbanPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  return <KanbanHome />
}
