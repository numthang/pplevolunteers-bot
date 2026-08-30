import { getTranslations } from 'next-intl/server'
import { isValidProvince } from '@/lib/provinceCode.js'
import { CASE_CATEGORIES, ALL_PROVINCES } from '@/lib/caseOptions.js'
import CaseNewForm from '@/components/case/CaseNewForm.jsx'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: t('new.metaTitle') }
}

export default async function CaseNewPage({ searchParams }) {
  const t = await getTranslations('case')
  const raw = (await searchParams)?.province || ''
  // province จาก URL (ลิงก์ที่ผู้ประสานงานแชร์) → fix ให้เลย · ไม่มี/ไม่ valid → picker
  const fixedProvince = raw && isValidProvince(raw) ? raw : ''

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text mb-2">{t('new.heading')}</h1>
        <p className="text-base text-gray-500 dark:text-disc-muted">
          {t('new.description')}
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
