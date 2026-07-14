import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('docs')
  return { title: t('pending.title') }
}

export default function Layout({ children }) { return children }
