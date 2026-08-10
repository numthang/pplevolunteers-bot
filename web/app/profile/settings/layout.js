import ProfileSettingsNav from '@/components/profile/ProfileSettingsNav.jsx'
import { getTranslations } from 'next-intl/server'

export const metadata = { title: 'ตั้งค่าของฉัน' }

// โครงเดียวกับ app/org/settings/layout.js เป๊ะ — mobile = nav แนวตั้งบนเนื้อหา · md+ = sidebar ซ้าย
export default async function ProfileSettingsLayout({ children }) {
  const t = await getTranslations('profile')
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text mb-4">{t('settingsNav.pageHeading')}</h1>
      <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <aside className="mb-4 md:mb-0">
          <ProfileSettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
