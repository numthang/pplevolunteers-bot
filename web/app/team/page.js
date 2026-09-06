import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import OrgChartClient from '@/components/bot/OrgChartClient.jsx'

export async function generateMetadata() {
  const t = await getTranslations('bot.orgchart')
  return { title: t('title') }
}

// คอมโพเนนต์ยังอยู่ที่ components/bot/ ตามเดิม — ย้ายแค่ "ที่ที่ผู้ใช้เข้าถึง" (route)
// ไม่ย้ายไฟล์ในรอบนี้ เพราะ API ก็ยังเป็น /api/bot/orgchart · ย้ายทีเดียวตอนแยก scope จริง
// ต้องมี Suspense ครอบ — OrgChartClient อ่านมุมมองจาก useSearchParams (?view=) และหน้านี้
// ไม่มีอะไรบังคับให้เป็น dynamic → next build จะฟ้อง "should be wrapped in a suspense boundary"
export default function TeamPage() {
  return (
    <Suspense>
      <OrgChartClient />
    </Suspense>
  )
}
