import { requireOrgUser } from '@/lib/orgAuth.js'
import { getTranslations } from 'next-intl/server'
import PersonalWatermarks from '@/components/org/PersonalWatermarks.jsx'

export const metadata = { title: 'ลายน้ำส่วนตัว' }

// ลายน้ำส่วนตัวอยู่ในพื้นที่ส่วนตัว ไม่ใช่ตั้งค่าองค์กร — ผูกกับ identity ไม่ใช่ org
export default async function PersonalBrandPage() {
  await requireOrgUser()
  const t = await getTranslations('org')

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">{t('personalBrand.title')}</h1>
      <p className="mt-1 mb-5 text-sm text-gray-500 dark:text-disc-muted">{t('personalBrand.subtitle')}</p>
      <PersonalWatermarks />
    </div>
  )
}
