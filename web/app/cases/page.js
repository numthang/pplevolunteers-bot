import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getUserScope, isAdmin } from '@/lib/caseAccess.js'
import { listCases, listCaseFacets, NO_CATEGORY } from '@/db/cases.js'
import { statusLabel, STATUS_LABELS } from '@/lib/caseOptions.js'
import CaseFilters from '@/components/case/CaseFilters.jsx'
import CaseRow from '@/components/case/CaseRow.jsx'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: t('manage.listMetaTitle') }
}

export default async function CaseManageList({ searchParams }) {
  const t = await getTranslations('case')
  const session = await getSession()
  const { access } = await getEffectiveIdentity(session)
  const orgId = await getOrgId(session)
  const scope = getUserScope(access) // null = admin (ทุกจังหวัด)

  const sp = await searchParams
  // ⭐ ตัวกรองทุกตัวอยู่ใน URL และ**ผสมกันได้ทั้งหมด** (แถว dropdown เหมือน /posts — user เคาะ 2026-09-01)
  //    ⛔ ลิงก์บนการ์ดหน้าแรก (app/page.js) ยิงมาที่ `?status=active&assigned=none|me|any` — ห้ามเปลี่ยนชื่อ
  //       param หรือค่าพิเศษ active/done โดยไม่แก้หน้าแรกพร้อมกัน ไม่งั้นกดเลขแล้วได้คนละชุด
  const assigned = ['none', 'me', 'any'].includes(sp?.assigned) ? sp.assigned : ''
  const selectedStatus = sp?.status || ''
  const selectedProvince = sp?.province || ''
  const selectedCategory = sp?.category || ''
  const archived = sp?.archived === '1'   // เคสในกรุ — คนละฝั่งกับงานที่กำลังทำ (เลือกจาก dropdown "ที่เก็บ")

  const [cases, facets] = await Promise.all([
    listCases(orgId, {
      provinces: scope,
      province: selectedProvince || null,
      category: selectedCategory || null,
      status: selectedStatus || null,
      assigned: assigned || null,
      mineUserId: session?.user?.userId || null,
      archived,
      limit: 300,
    }),
    listCaseFacets(orgId, scope, archived),
  ])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{t('manage.listHeading')}</h1>
        <Link
          href="/complaint/new"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-orange text-white text-base font-medium rounded-lg hover:bg-orange-light transition"
        >
          <span>+</span> {t('manage.addButton')}
        </Link>
      </div>

      <div className="mb-5">
        <CaseFilters
          assigned={assigned}
          status={selectedStatus}
          archived={archived}
          province={selectedProvince}
          category={selectedCategory}
          statuses={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          facets={facets}
          noCategoryValue={NO_CATEGORY}
          resultCount={cases.length}
        />
      </div>

      {cases.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-warm-400 dark:text-disc-muted">
          {archived ? t('manage.emptyArchived') : t('manage.emptyState')}
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            // statusLabel อ่านไฟล์ด้วย fs → แปลงเป็นข้อความที่ฝั่ง server แล้วส่งให้การ์ด
            <CaseRow key={c.id} c={c} statusText={statusLabel(c.status)} canPurge={isAdmin(access)} />
          ))}
        </div>
      )}
    </div>
  )
}
