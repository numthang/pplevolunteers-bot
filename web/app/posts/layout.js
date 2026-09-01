import { getSession } from '@/lib/auth.js'
import { requireFeature } from '@/lib/featureGate.js'

export const metadata = { title: { template: '%s — Posts', default: 'Posts' } }

export default async function PostsLayout({ children }) {
  const session = await getSession()
  await requireFeature(session, 'posts')
  return (
    <div className="-mx-1 sm:-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4">
        {children}
      </div>
    </div>
  )
}
