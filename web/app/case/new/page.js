import { isValidProvince } from '@/lib/provinceCode.js'
import { CASE_CATEGORIES, ALL_PROVINCES } from '@/lib/caseOptions.js'
import CaseNewForm from '@/components/case/CaseNewForm.jsx'

export const metadata = { title: 'แจ้งเรื่องร้องเรียน' }

export default async function CaseNewPage({ searchParams }) {
  const raw = (await searchParams)?.province || ''
  // province จาก URL (ลิงก์ที่ผู้ประสานงานแชร์) → fix ให้เลย · ไม่มี/ไม่ valid → picker
  const fixedProvince = raw && isValidProvince(raw) ? raw : ''

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text mb-2">แจ้งเรื่องร้องเรียน</h1>
        <p className="text-base text-gray-500 dark:text-disc-muted">
          กรอกรายละเอียดเรื่องที่ต้องการร้องเรียน ทีมงานจะติดต่อกลับและคุณติดตามสถานะได้ผ่านรหัสที่ได้รับทาง SMS
        </p>
      </div>

      <CaseNewForm
        fixedProvince={fixedProvince}
        provinces={ALL_PROVINCES}
        categories={CASE_CATEGORIES}
      />
    </div>
  )
}
