import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import PostsHome from '@/components/posts/PostsHome.jsx'

export async function generateMetadata() {
  const t = await getTranslations('posts')
  return { title: t('meta.list') }
}

export default async function PostsPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  // ชื่อองค์กรใช้ทำ badge บนการ์ด (โพสต์ทุกใบในหน้านี้อยู่ org เดียวกันอยู่แล้ว)
  const { activeOrg } = await resolveActiveOrg(session.user.userId)

  // ตัวกรอง/สถานะ/เรียง เก็บใน URL query string (ดู PostsHome.jsx) → useSearchParams() ต้องมี Suspense ครอบ
  return (
    <Suspense>
      <PostsHome orgName={activeOrg?.name || 'องค์กร'} />
    </Suspense>
  )
}
