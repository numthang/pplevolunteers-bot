import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth.js'
import PostsHome from '@/components/posts/PostsHome.jsx'

export const metadata = { title: 'โพสต์ทั้งหมด' }

export default async function PostsPage() {
  const session = await getSession()
  if (!session) redirect('/')

  return <PostsHome />
}
