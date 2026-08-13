import { getSession, redirectToLogin } from '@/lib/auth.js'
import { getTranslations } from 'next-intl/server'
import { isAdmin } from '@/lib/callingAccess.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import Link from 'next/link'
import ImportCampaignForm from '@/components/calling/ImportCampaignForm.jsx'

// นำเข้า calling log จากไฟล์ xlsx — backoffice ของ scripts/calling/import-calling-xlsx.js
// admin เท่านั้น (เขียนตรงเข้า cache_pple_member ข้าม sync ปกติ)
export default async function ImportCampaignPage() {
  const session = await getSession()
  if (!session) await redirectToLogin()

  const t = await getTranslations('calling')
  const { access } = await getEffectiveOrgIdentity(session)

  if (!isAdmin(access)) {
    return (
      <div className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">
        {t('importXlsx.adminOnly')}
      </div>
    )
  }

  return (
    <div>
      <Link href="/calling/campaigns" className="text-teal hover:underline mb-6 block text-base">
        {t('campaignForm.backLink')}
      </Link>

      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-disc-text">{t('importXlsx.title')}</h1>
        <p className="text-sm text-warm-500 dark:text-disc-muted mb-6">{t('importXlsx.subtitle')}</p>
        <ImportCampaignForm />
      </div>
    </div>
  )
}
