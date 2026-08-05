import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import PostsHome from '@/components/posts/PostsHome.jsx'

export async function generateMetadata() {
  const t = await getTranslations('posts')
  return { title: t('meta.list') }
}

export default async function PostsPage() {
  const session = await getSession()
  if (!session) redirect('/')

  // ชื่อองค์กรใช้ทำ badge บนการ์ด (โพสต์ทุกใบในหน้านี้อยู่ org เดียวกันอยู่แล้ว)
  const { activeOrg } = await resolveActiveOrg(session.user.userId)

  return <PostsHome orgName={activeOrg?.name || 'องค์กร'} />
}
