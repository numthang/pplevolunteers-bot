import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getUserScope } from '@/lib/caseAccess.js'
import { listCases, countByFilter, ACTIVE, DONE } from '@/db/cases.js'
import { statusLabel } from '@/lib/caseOptions.js'
import DocsProvinceFilter from '@/components/docs/DocsProvinceFilter.jsx'
import CaseFilterSelect from '@/components/case/CaseFilterSelect.jsx'

export async function generateMetadata() {
  const t = await getTranslations('case')
  return { title: t('manage.listMetaTitle') }
}

const STATUS_DOT = {
  open: 'bg-blue-500', in_progress: 'bg-amber-500',
  resolved: 'bg-green-500', closed: 'bg-gray-400', rejected: 'bg-red-500',
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

export default async function CaseManageList({ searchParams }) {
  const t = await getTranslations('case')
  const session = await getSession()
  const { access } = await getEffectiveIdentity(session)
  const orgId = await getOrgId(session)
  const scope = getUserScope(access) // null = admin (ทุกจังหวัด)

  const sp = await searchParams
  const selectedProvince = sp?.province || ''
  const selectedStatus = sp?.status || ''
  // ⭐ ตัวกรอง 2 ตัวนี้เกิดขึ้นเพื่อรองรับตัวเลขบนหน้าแรก (2026-08-30)
  //    เลขบนการ์ดต้องกดแล้วเจอ "ชุดเดียวกันเป๊ะ" ไม่งั้นได้อาการโชว์ 3 กดเข้าไปเห็น 12
  //    ⛔ แก้เงื่อนไขที่นี่เมื่อไหร่ ต้องแก้ countCaseStats ใน db/cases.js ให้ตรงกันเสมอ
  // ⭐ assigned = none|me|any — ตัวกรองที่ทำให้ 4 เลขบนการ์ดหน้าแรกกดแล้วเจอชุดเดียวกันเป๊ะ
  //    (นิยามอยู่ที่ db/cases.js · แก้ที่ไหนต้องแก้ countCaseStats ให้ตรงกันเสมอ)
  const assigned = ['none', 'me', 'any'].includes(sp?.assigned) ? sp.assigned : null

  const all = await listCases(orgId, {
    provinces: scope,
    status: selectedStatus || null,
    assigned,
    mineUserId: session?.user?.userId || null,
    limit: 300,
  })
  const counts = await countByFilter(orgId, session?.user?.userId || null, scope)

  const provinces = [...new Set(all.map(c => c.province).filter(Boolean))].sort()
  const cases = selectedProvince ? all.filter(c => c.province === selectedProvince) : all

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">{t('manage.listHeading')}</h1>
        <Link
          href="/complaint/new"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-orange text-white text-base font-medium rounded-lg hover:bg-orange-light transition"
        >
          <span>+</span> {t('manage.addButton')}
        </Link>
      </div>

      {/* ตัวกรอง — ต้อง**มองเห็นได้**ว่ากรองอะไรอยู่ เพราะคนส่วนใหญ่มาจากการกดเลขบนหน้าแรก
          ถ้าไม่โชว์ จะเข้าใจว่าองค์กรมีเคสอยู่แค่นี้จริงๆ
          ⚠️ href ทุกอันต้องตรงกับลิงก์บนการ์ดหน้าแรก (app/page.js) เป๊ะ
          ⚠️ เลขในวงเล็บมาจาก countByFilter — แก้เงื่อนไขที่นี่ต้องแก้ที่นั่นให้ตรงกันเสมอ */}
      <div className="mb-5">
        <CaseFilterSelect
          options={[
            { href: '/case', label: `${t('manage.filterAll')} (${counts.total})`, on: !assigned && !selectedStatus },
            { href: `/case?status=${ACTIVE}&assigned=none`, label: `${t('manage.filterUnassigned')} (${counts.unassigned})`, on: assigned === 'none' },
            { href: `/case?status=${ACTIVE}&assigned=me`, label: `${t('manage.filterMine')} (${counts.mine})`, on: assigned === 'me' },
            { href: `/case?status=${ACTIVE}&assigned=any`, label: `${t('manage.filterAssigned')} (${counts.assigned})`, on: assigned === 'any' },
            { href: `/case?status=${DONE}`, label: `${t('manage.filterDone')} (${counts.done})`, on: selectedStatus === DONE },
          ]}
        />
      </div>

      {provinces.length > 1 && (
        <div className="mb-5">
          <DocsProvinceFilter provinces={provinces} selected={selectedProvince} />
        </div>
      )}

      {cases.length === 0 ? (
        <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-10 text-center text-gray-400 dark:text-disc-muted">
          {t('manage.emptyState')}
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <Link key={c.id} href={`/case/${c.ref}`}
              className="flex items-center gap-3 bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-4 hover:border-orange transition">
              <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${STATUS_DOT[c.status] || 'bg-gray-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-disc-text truncate">{c.title || t('manage.noTitle')}</p>
                <p className="text-sm text-gray-400 dark:text-disc-muted">
                  <span className="font-mono">{c.ref}</span> · {c.province}{c.category ? ` · ${c.category}` : ''} · {fmtDate(c.created_at)}
                </p>
              </div>
              <span className="shrink-0 text-sm text-gray-500 dark:text-disc-muted">{statusLabel(c.status)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
