import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import AssetLibrary from '@/components/posts/AssetLibrary.jsx'

export async function generateMetadata() {
  const t = await getTranslations('posts')
  return { title: t('meta.library') }
}

export default async function PostsLibraryPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  const t = await getTranslations('posts.library')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-warm-900 dark:text-disc-text">{t('pageTitle')}</h1>
        <p className="text-sm text-warm-500 dark:text-disc-muted mt-0.5">{t('pageSubtitle')}</p>
      </div>
      <AssetLibrary mode="page" />
    </div>
  )
}
