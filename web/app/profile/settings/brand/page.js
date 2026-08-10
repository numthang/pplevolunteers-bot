import { requireOrgUser } from '@/lib/orgAuth.js'
import { getTranslations } from 'next-intl/server'
import PersonalWatermarks from '@/components/profile/PersonalWatermarks.jsx'
import PersonalQuotePrefs from '@/components/profile/PersonalQuotePrefs.jsx'

export const metadata = { title: 'ลายน้ำ & การ์ดของฉัน' }

// ของส่วนตัวล้วน — ตามคนข้าม org (ต่างจาก /org/settings/brand ที่เป็นแบรนด์ขององค์กร)
export default async function ProfileBrandPage() {
  await requireOrgUser()
  const t = await getTranslations('profile')

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-disc-text">{t('brand.title')}</h2>
      <p className="mt-1 mb-5 text-sm text-gray-500 dark:text-disc-muted">{t('brand.subtitle')}</p>
      <PersonalWatermarks />
      <PersonalQuotePrefs />
    </div>
  )
}
