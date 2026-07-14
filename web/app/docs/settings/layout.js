import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('docs')
  return { title: t('settings.metaTitle') }
}

export default function Layout({ children }) { return children }
