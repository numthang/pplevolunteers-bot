import Link from 'next/link'
import { getSession } from '@/lib/auth.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getOrgGuildIds } from '@/lib/org.js'
import { getUserScope } from '@/lib/caseAccess.js'
import { listCases, countByStatus } from '@/db/cases.js'
import { statusLabel } from '@/lib/caseOptions.js'
import DocsProvinceFilter from '@/components/docs/DocsProvinceFilter.jsx'

export const metadata = { title: 'รายการเคส' }

const STATUS_DOT = {
  open: 'bg-blue-500', in_progress: 'bg-amber-500',
  resolved: 'bg-green-500', closed: 'bg-gray-400', rejected: 'bg-red-500',
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

export default async function CaseManageList({ searchParams }) {
  const session = await getSession()
  const { access } = await getEffectiveIdentity(session)
  const guildId = await getGuildId(session)
  const orgGuildIds = await getOrgGuildIds(guildId)
  const scope = getUserScope(access) // null = admin (ทุกจังหวัด)

  const sp = await searchParams
  const selectedProvince = sp?.province || ''
  const selectedStatus = sp?.status || ''

  const all = await listCases(orgGuildIds, { provinces: scope, status: selectedStatus || null, limit: 300 })
  const counts = await countByStatus(orgGuildIds, scope)

  const provinces = [...new Set(all.map(c => c.province).filter(Boolean))].sort()
  const cases = selectedProvince ? all.filter(c => c.province === selectedProvince) : all

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text mb-1">เรื่องร้องเรียน</h1>
        <p className="text-base text-gray-500 dark:text-disc-muted">
          ทั้งหมด {all.length} เรื่อง · รับเรื่องใหม่ {counts.open || 0} · กำลังดำเนินการ {counts.in_progress || 0}
        </p>
      </div>

      {provinces.length > 1 && (
        <div className="mb-5">
          <DocsProvinceFilter provinces={provinces} selected={selectedProvince} />
        </div>
      )}

      {cases.length === 0 ? (
        <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-10 text-center text-gray-400 dark:text-disc-muted">
          ยังไม่มีเรื่องร้องเรียน
        </div>
      ) : (
        <div className="space-y-2">
          {cases.map(c => (
            <Link key={c.id} href={`/case/manage/${c.ref}`}
              className="flex items-center gap-3 bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-4 hover:border-orange transition">
              <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${STATUS_DOT[c.status] || 'bg-gray-300'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-gray-900 dark:text-disc-text truncate">{c.title || '(ไม่มีหัวข้อ)'}</p>
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
