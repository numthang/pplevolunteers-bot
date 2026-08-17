import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import BoardView from '@/components/kanban/BoardView.jsx'

export async function generateMetadata() {
  const t = await getTranslations('kanban')
  return { title: t('meta.board') }
}

export default async function KanbanBoardPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  return <BoardView />
}
