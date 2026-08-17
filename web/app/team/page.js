import { getTranslations } from 'next-intl/server'
import OrgChartClient from '@/components/bot/OrgChartClient.jsx'

export async function generateMetadata() {
  const t = await getTranslations('bot.orgchart')
  return { title: t('title') }
}

// คอมโพเนนต์ยังอยู่ที่ components/bot/ ตามเดิม — ย้ายแค่ "ที่ที่ผู้ใช้เข้าถึง" (route)
// ไม่ย้ายไฟล์ในรอบนี้ เพราะ API ก็ยังเป็น /api/bot/orgchart · ย้ายทีเดียวตอนแยก scope จริง
export default function TeamPage() {
  return <OrgChartClient />
}
