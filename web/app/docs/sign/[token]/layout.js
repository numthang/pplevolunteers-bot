import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('docs')
  return { title: t('sign.layoutTitle') }
}

export default function Layout({ children }) { return children }
