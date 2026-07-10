import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('calling')
  return { title: t('assignment.metaTitle') }
}

export default function Layout({ children }) { return children }
