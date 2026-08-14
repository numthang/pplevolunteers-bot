import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import HomeworkHome from '@/components/kanban/HomeworkHome.jsx'

export async function generateMetadata() {
  const t = await getTranslations('kanban')
  return { title: t('meta.list') }
}

export default async function KanbanPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  return <HomeworkHome />
}
