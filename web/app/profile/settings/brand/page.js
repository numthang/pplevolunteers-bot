import { requireOrgUser } from '@/lib/orgAuth.js'
import PersonalWatermarks from '@/components/profile/PersonalWatermarks.jsx'
import PersonalQuotePrefs from '@/components/profile/PersonalQuotePrefs.jsx'

export const metadata = { title: 'ลายน้ำ & การ์ดของฉัน' }

// ของส่วนตัวล้วน — ตามคนข้าม org (ต่างจาก /org/settings/brand ที่เป็นแบรนด์ขององค์กร)
export default async function ProfileBrandPage() {
  await requireOrgUser()

  return (
    <div>
      {/* ไม่มีหัวข้อ — sidebar บอกแล้ว · คำอธิบายอยู่ในตัว PersonalWatermarks เอง */}
      <PersonalWatermarks />
      <PersonalQuotePrefs />
    </div>
  )
}
