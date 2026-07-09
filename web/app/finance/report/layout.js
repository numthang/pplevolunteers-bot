import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('finance')
  return { title: t('report.title') }
}
export default function Layout({ children }) { return children }
