import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import PostCreate from '@/components/posts/PostCreate.jsx'

export async function generateMetadata() {
  const t = await getTranslations('posts')
  return { title: t('meta.new') }
}

// segment คงที่ 'new' ชนะ '[id]' ของ Next.js อยู่แล้ว → /posts/new ไม่หลุดไปหน้าแก้ไข
export default async function NewPostPage({ searchParams }) {
  const session = await getSession()
  if (!session) redirect('/')

  const { as, category } = await searchParams
  const { activeOrg } = await resolveActiveOrg(session.user.userId)

  return (
    <PostCreate
      orgName={activeOrg?.name || 'องค์กร'}
      defaultVisibility={as === 'org' ? 'org' : 'personal'}
      defaultCategory={typeof category === 'string' ? category : ''}
    />
  )
}
