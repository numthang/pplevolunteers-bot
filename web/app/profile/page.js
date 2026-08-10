import { requireOrgUser } from '@/lib/orgAuth.js'
import { getTranslations } from 'next-intl/server'

export const metadata = { title: 'ของฉัน' }

// hub ของเรื่องส่วนตัว — ผูกกับตัวคน ไม่ใช่ org (สมมาตรกับ /org ที่เป็น hub ขององค์กร)
//
// ⚠️ เกณฑ์ว่าอะไรควรอยู่ที่นี่: **ของชิ้นนี้ตามคนข้าม org ไหม** (เคาะ 2026-08-10)
//    ตามไป = ที่นี่ (ลายน้ำส่วนตัว, ค่าตั้งการ์ด, ตัวตน) · ไม่ตาม = ของ org
//    โพสต์/สื่อ/เพจ "ส่วนตัว" **ไม่ใช่ของที่นี่** — ตารางพวกนั้นมี org_id อยู่แล้ว
//    และมีบ้านแล้วที่ตัวกรอง "ส่วนตัว" ใน /posts
export default async function ProfileHomePage() {
  await requireOrgUser()
  const t = await getTranslations('profile')

  const cardCls = 'rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5 hover:border-orange/40'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">{t('hub.title')}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">{t('hub.subtitle')}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <a href="/profile/settings" className={cardCls}>
          <div className="text-2xl">🪪</div>
          <h2 className="mt-2 font-semibold text-gray-900 dark:text-disc-text">{t('hub.settingsTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-disc-muted">{t('hub.settingsDesc')}</p>
        </a>
        <a href="/profile/settings/brand" className={cardCls}>
          <div className="text-2xl">💧</div>
          <h2 className="mt-2 font-semibold text-gray-900 dark:text-disc-text">{t('brand.title')}</h2>
          <p className="text-sm text-gray-500 dark:text-disc-muted">{t('brand.subtitle')}</p>
        </a>
        {/* /cooking ไม่มีทางเข้าจากที่ไหนเลยก่อนหน้านี้ (ไม่อยู่ใน Nav/APPS) — ที่นี่คือประตูของมัน */}
        <a href="/cooking" className={cardCls}>
          <div className="text-2xl">🍳</div>
          <h2 className="mt-2 font-semibold text-gray-900 dark:text-disc-text">Cooking</h2>
          <p className="text-sm text-gray-500 dark:text-disc-muted">{t('hub.cookingDesc')}</p>
        </a>
      </div>
    </div>
  )
}
