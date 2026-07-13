import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { resolveProvince } from '@/lib/provinceCode.js'
import { CASE_CATEGORIES, ALL_PROVINCES } from '@/lib/caseOptions.js'
import CaseNewForm from '@/components/case/CaseNewForm.jsx'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: t('new.metaTitle') }
}

export default async function CaseNewProvincePage({ params }) {
  const t = await getTranslations('case')
  const { province: raw } = await params
  const fixedProvince = resolveProvince(raw)

  // ไม่รู้จักรหัส/ชื่อนี้ → ไป picker
  if (!fixedProvince) redirect('/case/new')

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
