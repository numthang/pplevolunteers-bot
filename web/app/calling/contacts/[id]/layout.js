import { getTranslations } from 'next-intl/server'

// หน้า detail เป็น client component (ดึงข้อมูลฝั่ง client) → ตั้งชื่อแท็บที่ layout แทน
// ไม่ใส่ชื่อผู้ติดต่อลงชื่อแท็บโดยตั้งใจ — ข้อมูล CRM ไม่ควรโผล่ในประวัติเบราว์เซอร์/แถบแท็บ
export async function generateMetadata() {
  const t = await getTranslations('calling')
  return { title: t('contactDetail.metaTitle') }
}

export default function Layout({ children }) { return children }
