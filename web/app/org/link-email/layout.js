import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('org')
  return { title: t('linkEmail.metaTitle') }
}

export default function Layout({ children }) { return children }
