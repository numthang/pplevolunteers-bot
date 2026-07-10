import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('calling')
  return { title: t('campaignForm.metaTitleEdit') }
}

export default function Layout({ children }) { return children }
